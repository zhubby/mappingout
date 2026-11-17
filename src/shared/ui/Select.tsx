/**
 * [INPUT]: 依赖受控值、可选分组与图标和 React 浮层生命周期。
 * [OUTPUT]: 提供统一外观、键盘选择和触摸选择的 Select。
 * [POS]: 全应用单选菜单；业务视图保留筛选与存储规则。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import {Check, ChevronDown} from 'lucide-react';
import './select.css';

export interface SelectOption {
  value: string | number;
  label: string;
  icon?: string;
  group?: string;
  disabled?: boolean;
}
interface SelectProps {
  value: string | number;
  options: readonly SelectOption[];
  onValueChange(value: string): void;
  'aria-label': string;
  disabled?: boolean;
  className?: string;
}
const searchable = (text: string) => text.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();

export default function Select({value, options, onValueChange, 'aria-label': label, disabled = false, className = ''}: SelectProps) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef({text:'', time:0});
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<CSSProperties>({visibility:'hidden'});
  const selected = options.findIndex(option => String(option.value) === String(value));
  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
  const expanded = open && !disabled && enabled.length > 0;
  const optionId = (index: number) => `${id}-option-${index}`;

  function show(index = selected) {
    if (disabled || !enabled.length) return;
    trigger.current?.focus({preventScroll:true});
    search.current = {text:'', time:0};
    setActive(enabled.includes(index) ? index : enabled[0]);
    setPosition({visibility:'hidden'});
    setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    setOpen(false);
    trigger.current?.focus({preventScroll:true});
    if (String(option.value) !== String(value)) onValueChange(String(option.value));
  }
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' && expanded) {
      event.preventDefault(); event.stopPropagation(); setOpen(false); return;
    }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (disabled || !enabled.length || event.altKey || event.ctrlKey || event.metaKey) return;
    const typing = Date.now() - search.current.time < 700 && search.current.text;
    if (event.key === 'Enter' || (event.key === ' ' && !typing)) {
      event.preventDefault();
      if (expanded) choose(active); else show();
    } else if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault();
      if (!expanded) {
        show(event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1)! : selected);
      } else {
        const current = enabled.indexOf(active);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 :
          Math.max(0, Math.min(enabled.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
        setActive(enabled[next]);
      }
    } else if (event.key.length === 1) {
      event.preventDefault();
      const now = Date.now();
      const character = searchable(event.key);
      const previous = now - search.current.time < 700 ? search.current.text : '';
      const text = previous === character ? character : previous + character;
      search.current = {text, time:now};
      const start = enabled.indexOf(expanded ? active : selected);
      const ordered = [...enabled.slice(start + 1), ...enabled.slice(0, start + 1)];
      const match = ordered.find(index => searchable(options[index].label).startsWith(text));
      if (match !== undefined) {
        if (!expanded) { setPosition({visibility:'hidden'}); setOpen(true); }
        setActive(match);
      }
    }
  }

  useLayoutEffect(() => {
    if (!expanded) return;
    function place() {
      if (!trigger.current || !popup.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
      const topEdge = (viewport?.offsetTop ?? 0) + 8;
      const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - 16;
      const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - 16;
      const below = bottomEdge - anchor.bottom - 6;
      const above = anchor.top - topEdge - 6;
      const upward = below < Math.min(220, popup.current.scrollHeight) && above > below;
      const available = Math.max(0, upward ? above : below);
      const maxHeight = Math.min(320, available);
      const height = Math.min(popup.current.scrollHeight, maxHeight);
      const width = Math.min(Math.max(anchor.width, 200), rightEdge - leftEdge);
      setPosition({
        left:Math.max(leftEdge, Math.min(anchor.left, rightEdge - width)),
        top:Math.max(topEdge, upward ? anchor.top - height - 6 : anchor.bottom + 6),
        width, maxHeight, fontFamily:getComputedStyle(trigger.current).fontFamily,
      });
    }
    place();
    const observer = new ResizeObserver(place);
    if (trigger.current) observer.observe(trigger.current);
    if (popup.current) observer.observe(popup.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [expanded, options]);

  useLayoutEffect(() => {
    if (expanded && active >= 0) document.getElementById(optionId(active))?.scrollIntoView({block:'nearest'});
  }, [expanded, active, position.maxHeight, position.width]);

  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!trigger.current?.contains(node) && !popup.current?.contains(node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [expanded]);

  const groups: {label?: string; indices: number[]}[] = [];
  options.forEach((option, index) => {
    const last = groups.at(-1);
    if (last && last.label === option.group) last.indices.push(index);
    else groups.push({label:option.group, indices:[index]});
  });
  const renderOption = (index: number) => <div key={String(options[index].value)} id={optionId(index)}
    role="option" aria-selected={index === selected} aria-disabled={options[index].disabled || undefined}
    data-value={String(options[index].value)} className={`select-option${active === index ? ' is-active' : ''}`}
    onPointerMove={() => { if (!options[index].disabled) setActive(index); }}
    onMouseDown={event => event.preventDefault()}
    onClick={() => choose(index)}>
    <span className="select-option-copy">{options[index].icon && <img className="select-icon" src={options[index].icon} alt="" aria-hidden="true"/>}<span>{options[index].label}</span></span>{index === selected && <Check size={14} aria-hidden="true"/>}
  </div>;

  return <>
    <button ref={trigger} id={`${id}-trigger`} type="button" role="combobox" aria-label={label}
      aria-haspopup="listbox" aria-expanded={expanded} aria-controls={expanded ? `${id}-menu` : undefined}
      aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
      data-value={String(value)} disabled={disabled || !enabled.length} className={`select-trigger ${className}`.trim()}
      onKeyDown={onKeyDown} onBlur={() => setOpen(false)} onClick={() => expanded ? setOpen(false) : show()}>
      <span className="select-value">{(options[selected] ?? options[0])?.icon && <img className="select-icon" src={(options[selected] ?? options[0]).icon} alt="" aria-hidden="true"/>}<span className="select-value-label">{options[selected]?.label ?? options[0]?.label ?? ''}</span></span>
      <ChevronDown className="select-chevron" size={14} aria-hidden="true"/>
    </button>
    {expanded && createPortal(<div ref={popup} id={`${id}-menu`} role="listbox" aria-label={label}
      className="select-menu" style={position}>
      {groups.map((group, index) => group.label ? <div role="group" aria-label={group.label} key={index}>
        <div className="select-group-label" aria-hidden="true">{group.label}</div>{group.indices.map(renderOption)}
      </div> : group.indices.map(renderOption))}
    </div>, document.body)}
  </>;
}
