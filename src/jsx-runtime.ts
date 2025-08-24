// Re-export core types and functions needed by the runtime from your main entry.
// This prevents code duplication.
export {
  createEffect,
  createMemo,
  createComponent,
  untrack,
  onCleanup,
  createRoot,
} from './index';
import { createEffect } from './index';

// You can move the implementation of these helpers here or just re-export them.
// For simplicity, let's assume you've moved them here.
// NOTE: I have simplified some of your implementations to be more idiomatic with dom-expressions
// and removed your old createElement/insert functions which are no longer needed.

// We must export these so the babel plugin can find them
export function template(html: string, isSVG?: boolean) {
  const t = document.createElement("template");
  t.innerHTML = html;
  // for SVG, the plugin wraps it in an <svg> tag, so we need to go one level deeper
  let node = isSVG ? t.content.firstChild!.firstChild! : t.content.firstChild!;
  return node.cloneNode(true);
}

const delegatedEvents = new Set<string>();

export function delegateEvents(eventNames: string[]) {
  for (const name of eventNames) {
    if (!delegatedEvents.has(name)) {
      delegatedEvents.add(name);
      document.addEventListener(name, eventHandler);
    }
  }
}

function eventHandler(e: Event) {
  const key = `$$${e.type}`;
  let node = ((e.composedPath && e.composedPath()[0]) || e.target) as any;

  while (node) {
    const handler = node[key];
    if (handler && !node.disabled) {
      handler(e);
      if (e.defaultPrevented) return;
    }
    node = node.parentNode;
  }
}

export function addEventListener(el: Node, name: string, handler: (e: Event) => void) {
  (el as any)[`$$${name}`] = handler;
}

export function insert(parent: Node, accessor: any, marker?: Node | null) {
  if (typeof accessor === 'function') {
    createEffect(() => {
      // This part needs a proper reconciliation logic, which is complex.
      // For now, a simple clearing and inserting logic can work for basic cases.
      // SolidJS has a very optimized implementation for this.
      const value = accessor();
      const el = Array.isArray(value) ? value.flat() : [value];
      let current = marker ? marker.previousSibling : parent.lastChild;
      // You would need a real DOM diffing/reconciliation here.
      // For now, let's just clear and add.
      while (current && current !== (marker ? marker.parentNode!.firstChild : parent.firstChild)) {
         const prev = current.previousSibling;
         parent.removeChild(current);
         current = prev;
      }
      for (const node of el) {
        parent.insertBefore(node instanceof Node ? node : document.createTextNode(String(node)), marker);
      }
    });
  } else if (accessor instanceof Node) {
    parent.insertBefore(accessor, marker);
  } else {
    parent.insertBefore(document.createTextNode(String(accessor)), marker);
  }
}

export function setAttribute(el: Element, name: string, value: any) {
  if (value == null || value === false) {
    el.removeAttribute(name);
  } else {
    el.setAttribute(name, value === true ? "" : value);
  }
}

export function effect(fn: (node: Node) => void, node: Node) {
  createEffect(() => fn(node));
}

// Add other necessary exports that dom-expressions might need, like:
// spread, style, className, etc. You have many of these implemented already.
// Just ensure they are exported from this file.
export {
  className,
  mergeProps,
  setStyleProperty,
  For,
} from './index'; // or move implementations here
