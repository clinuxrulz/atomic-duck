import { mapArray } from "./array.ts";
import type { JSX } from "./jsx";

export type Accessor<A> = () => A;
export type Setter<A> = (a: A) => A;
export type Signal<A> = [ get: Accessor<A>, set: Setter<A>, ];
export type Component<P={}> = (props: P) => JSX.Element;

export { mapArray } from "./array.ts";

export interface Cleanup {
  (): void;
}

const enum ADNodeFlags {
  None = 0,
  Dirty = 1 << 0,
  RecomputingDeps = 1 << 1,
  InHeap = 1 << 2,
  InFallbackHeap = 1 << 3,
};

export interface Link {
  dep: ADNode;
  sub: ADNode;
  nextDep: Link | undefined;
  prevSub: Link | undefined;
  nextSub: Link | undefined;
};

interface ADNode {
  deps: Link | undefined;
  depsTail: Link | undefined;
  flags: ADNodeFlags;
  context: ADNode;
  height: number;
  nextHeap: ADNode | undefined;
  prevHeap: ADNode;
  cleanup: Cleanup | Cleanup[] | undefined;
  /**
   * The update function.
   * Returns true if the node changed in value.
   */
  readonly update?: () => boolean;
}

let context: ADNode | undefined = undefined;

let minDirty = Number.POSITIVE_INFINITY;
let maxDirty = 0;
let nextMaxDirty = 0;
let contextHeight = 0;
let heapSize = 0;
let fallbackHeap: ADNode | undefined = undefined;
const dirtyHeap: (ADNode | undefined)[] = new Array(2000);
function increaseHeapSize(n: number) {
  if (n > dirtyHeap.length) {
    dirtyHeap.length = n;
  }
}

function insertIntoHeapMap(n: ADNode) {
  let flags = n.flags;
  if (flags & (ADNodeFlags.InHeap | ADNodeFlags.RecomputingDeps)) return;
  if (flags & ADNodeFlags.InFallbackHeap) {
    // flags ^= ADNodeFlags.InFallbackHeap;
    if (n.prevHeap === n) {
      fallbackHeap = undefined;
    } else {
      const next = n.nextHeap;
      const dhh = fallbackHeap!;
      const end = next ?? dhh;
      if (n === dhh) {
        fallbackHeap = next;
      } else {
        n.prevHeap.nextHeap = next;
      }
      end.prevHeap = n.prevHeap;
    }
    n.prevHeap = n;
    n.nextHeap = undefined;
  }
  heapSize++;
  n.flags = flags | ADNodeFlags.InHeap;
  const height = n.height;
  const heapAtHeight = dirtyHeap[height];
  if (heapAtHeight === undefined) {
    dirtyHeap[height] = n;
  } else {
    const tail = heapAtHeight.prevHeap;
    tail.nextHeap = n;
    n.prevHeap = tail;
    heapAtHeight.prevHeap = n;
  }
  if (height > maxDirty) {
    maxDirty = height;
  } else if (height <= minDirty) {
    nextMaxDirty = height;
  }
}

function transaction<A>(k: () => A): A {
  ++transactionDepth;
  let result: A;
  try {
    result = k();
  } finally {
    --transactionDepth;
  }
  if (transactionDepth == 0) {
    backwardsFlush();
  }
  return result;
}

function backwardsFlush() {
    todoStack1.push(...cursorSet);
    cursorSet.clear();
    while (true) {
        let node = todoStack1.pop();
        if (node == undefined) {
            let tmp = todoStack1;
            todoStack1 = todoStack2;
            todoStack2 = tmp;
            todoStack1.reverse();
            node = todoStack1.pop();
            if (node == undefined) {
                break;
            }
        }
        if (node.state == "Clean") {
          continue;
        }
        let hasDirtyOrStaleSources = false;
        if (node.sources != undefined) {
            for (let source of node.sources) {
                if (source.state == "Dirty" || source.state == "Stale") {
                    hasDirtyOrStaleSources = true;
                    break;
                }
            }
            if (hasDirtyOrStaleSources) {
                todoStack2.push(node);
                for (let source of node.sources) {
                    if (source.state == "Dirty" || source.state == "Stale") {
                        todoStack1.push(source);
                    }
                }
            }
        }
        if (!hasDirtyOrStaleSources) {
            if (node.state == "Stale") {
                node.state = "Clean";
            } else if (node.state == "Dirty") {
                node.state = "Clean";
                if (node.update != undefined) {
                    let changed = node.update();
                    if (changed) {
                      if (node.sinks != undefined) {
                        for (let sink of node.sinks) {
                          sink.state = "Dirty";
                          resetToStaleSet.add(sink);
                          todoStack1.push(sink);
                        }
                      }
                    }
                }
            }
        }
    }
    for (let node of resetToStaleSet) {
        node.state = "Stale";
    }
    resetToStaleSet.clear();
}

function useOwner<A>(innerOwner: ADNode, k: () => A): A {
  let oldOwner = owner;
  owner = innerOwner;
  let result: A;
  try {
    result = k();
  } finally {
    owner = oldOwner;
  }
  return result;
}

function useObserver<A>(innerObserver: ADNode | undefined, k: () => A): A {
  let oldObserver = observer;
  observer = innerObserver;
  let result: A;
  try {
    result = k();
  } finally {
    observer = oldObserver;
  }
  return result;
}

function useOwnerAndObserver<A>(innerOwnerAndObserver: ADNode | undefined, k: () => A): A {
  let oldOwner = owner;
  let oldObserver = observer;
  let result: A;
  owner = innerOwnerAndObserver;
  observer = innerOwnerAndObserver;
  try {
    result = k();
  } finally {
    owner = oldOwner;
    observer = oldObserver;
  }
  return result;
}

function dirtyTheSinks(node: ADNode) {
  if (node.sinks == undefined) {
    return;
  }
  for (let sink of node.sinks) {
    if (sink.state != "Dirty") {
      sink.state = "Dirty";
      // Always eagar
      cursorSet.add(sink);
      //
      resetToStaleSet.add(node);
    }
  }
}

function resolveNode(node: ADNode) {
  if (node.state == "Clean") {
    return;
  }
  let dirtyOrStaleSources: ADNode[] = [];
  if (node.sources != undefined) {
    for (let source of node.sources) {
      if (source.state == "Dirty" || source.state == "Stale") {
        dirtyOrStaleSources.push(source);
      }
    }
  }
  for (let node of dirtyOrStaleSources) {
    resolveNode(node);
  }
  if (node.state == "Stale") {
    node.state = "Clean";
  } else if (node.state == "Dirty") {
    let changed = false;
    if (node.update != undefined) {
      cleanupNode(node);
      changed = node.update();
    }
    node.state = "Clean";
    if (changed) {
      dirtyTheSinks(node);
    }
  }
}

function cleanupNode(node: ADNode) {
  let stack = [ node, ];
  while (true) {
    let atNode = stack.pop();
    if (atNode == undefined) {
      break;
    }
    if (atNode.sources != undefined) {
      for (let source of atNode.sources) {
        if (source.sinks != undefined) {
          source.sinks.delete(atNode);
        }
      }
      atNode.sources.clear();
    }
    if (atNode.cleanups != undefined) {
      for (let cleanup of atNode.cleanups) {
        cleanup();
      }
      atNode.cleanups.splice(0, atNode.cleanups.length);
    }
    if (atNode.children != undefined) {
      stack.push(...atNode.children);
      atNode.children.clear();
    }
  }
}

export function batch<A>(k: () => A): A {
  return transaction(k);
}

export function createMemo<A>(
  k: () => A,
  options?: {
    equals: (a: A, b: A) => boolean,
  },
): Accessor<A> {
  if (owner == undefined) {
    throw new Error("Creating a memo outside owner is not supported.");
  }
  let equals = options?.equals ?? ((a, b) => a === b);
  let value: A | undefined = undefined;
  let children = new Set<ADNode>();
  let cleanups: (() => void)[] = [];
  let sources = new Set<ADNode>();
  let sinks = new Set<ADNode>();
  let node: ADNode = {
    state: "Dirty",
    children,
    cleanups,
    sources,
    sinks,
    update: () => {
      let oldValue = value;
      value = useOwnerAndObserver(node, k);
      return !(oldValue == undefined ?
        true :
        equals(value, oldValue));
    },
  };
  owner.children?.add(node);
  transaction(() => {
    cursorSet.add(node);
    resetToStaleSet.add(node);
  });
  return () => {
    if (observer != undefined) {
      observer.sources?.add(node);
      sinks.add(observer);
    }
    resolveNode(node);
    return value!;
  };
}

export function createEffect(k: () => void) {
  if (owner == undefined) {
    throw new Error("Creating an effect outside owner is not supported.");
  }
  let children = new Set<ADNode>();
  let cleanups: (() => void)[] = [];
  let sources = new Set<ADNode>();
  let sinks = new Set<ADNode>();
  let node: ADNode = {
    state: "Dirty",
    children,
    cleanups,
    sources,
    sinks,
    update: () => {
      useOwnerAndObserver(node, k);
      return false;
    },
  };
  owner.children?.add(node);
  transaction(() => {
    cursorSet.add(node);
    resetToStaleSet.add(node);
  });
}

export function onCleanup(k: () => void) {
  if (owner == undefined) {
    throw new Error("Creating a cleanup outside owner is not supported.");
  }
  owner.cleanups?.push(k);
}

export function untrack<A>(k: () => A): A {
  return useObserver(undefined, k);
}

export function createSignal<A>(): Signal<A | undefined>;
export function createSignal<A>(a: A): Signal<A>;
export function createSignal<A>(a?: A): Signal<A> | Signal<A | undefined> {
  if (a == undefined) {
    return createSignal2<A | undefined>(undefined);
  } else {
    return createSignal2<A>(a);
  }
}

function createSignal2<A>(a: A): Signal<A> {
  let value = a;
  let sinks = new Set<ADNode>();
  let node: ADNode = {
    state: "Clean",
    sinks,
  };
  return [
    () => {
      if (observer != undefined) {
        observer.sources?.add(node);
        sinks.add(observer);
      }
      return value;
    },
    (x) => {
      transaction(() => {
        value = x;
        dirtyTheSinks(node);
      });
      return x;
    },
  ];
}

export function createRoot<A>(k: (dispose: () => void) => A): A {
  let children = new Set<ADNode>();
  let cleanups: (() => void)[] = [];
  let node: ADNode = {
    state: "Clean",
    children,
    cleanups,
  };
  let dispose = () => cleanupNode(node);
  return useOwner(node, () => k(dispose));
}

export function createHalfEdge<A>(a: Accessor<A>): Accessor<void> {
  if (owner == undefined) {
    throw new Error("Creating a half edge outside owner is not supported.");
  }
  let children = new Set<ADNode>();
  let cleanups: (() => void)[] = [];
  let sources = new Set<ADNode>();
  let node: ADNode = {
    state: "Dirty",
    children,
    cleanups,
    sources,
    update: () => {
      useOwnerAndObserver(node, a);
      return false;
    },
  };
  owner.children?.add(node);
  transaction(() => {
    cursorSet.add(node);
    resetToStaleSet.add(node);
  });
  return () => {
    if (observer != undefined) {
      observer.sources?.add(node);
    }
    resolveNode(node);
  };
}

export function createSelector<A>(selection: Accessor<A | undefined>): (key: A) => boolean {
  let map = new Map<A,{
    s: Signal<boolean>,
    refCount: number,
  }>();
  let lastSelection: A | undefined = undefined;
  let halfEdge = createHalfEdge(() => {
    let selection2 = selection();
    if (selection2 === lastSelection) {
      return;
    }
    if (lastSelection != undefined) {
      let entry = map.get(lastSelection);
      if (entry != undefined) {
        entry.s[1](false);
      }
    }
    if (selection2 != undefined) {
      let entry = map.get(selection2);
      if (entry != undefined) {
        entry.s[1](true);
      }
    }
    lastSelection = selection2;
  });
  return (key) => {
    halfEdge();
    let entry = map.get(key);
    if (entry == undefined) {
      entry = {
        s: createSignal(untrack(() => selection() === key)),
        refCount: 1,
      };
      map.set(key, entry);
    } else {
      entry.refCount++;
    }
    onCleanup(() => {
      entry.refCount--;
      if (entry.refCount == 0) {
        queueMicrotask(() => {
          if (entry.refCount == 0) {
            map.delete(key);
          }
        });
      }
    });
    return entry.s[0]();
  };
}

// We must export these so the babel plugin can find them
export const createElement = (tag: string, props: any, ...children: any[]) => {
  const el = document.createElement(tag) as HTMLElement;

  for (const propName in props) {
    if (propName === 'ref') {
      props.ref(el);
      continue;
    }
    if (propName === 'style') {
      Object.assign(el.style, props[propName]);
      continue;
    }
    if (propName.startsWith('on')) {
      const eventName = propName.slice(2).toLowerCase();
      el.addEventListener(eventName, props[propName]);
      continue;
    }
    if (propName === 'className') {
      el.setAttribute('class', props[propName]);
      continue;
    }

    // Set other attributes
    el.setAttribute(propName, props[propName]);
  }

  // Handle children, including text and other elements
  insert(el, children);

  return el;
};

// Creates a reactive text node.
export const createTextNode = (text: string | number) => {
  const node = document.createTextNode('');
  insert(node, text);
  return node;
};

// We use a WeakMap to store the nodes from the previous render.

export const insert = (
  parent: Node,
  accessor: any,
  anchor: Node | null = null
) => {
  const lastNodesMap = new WeakMap<Node, Node[]>();
  // Use a comment node as a marker for the start of the inserted nodes
  let marker = document.createComment('');
  parent.insertBefore(marker, anchor);

  createEffect(() => {
    // Corrected: Handle both static values and function accessors
    const value = typeof accessor === 'function' ? accessor() : accessor;

    // Normalize the value into an array of nodes
    const resolvedNodes = Array.isArray(value) ? value : [value];
    
    const nodesToInsert = resolvedNodes.map(child => {
      // Check if the child is a function and resolve its value
      const resolvedChild = typeof child === 'function' ? untrack(child) : child;

      if (resolvedChild instanceof Node) {
        return resolvedChild;
      }
      return document.createTextNode(resolvedChild.toString());
    });

    // Get the nodes from the last render associated with this parent
    const oldNodes = lastNodesMap.get(parent) || [];

    // Remove the old nodes from the DOM
    for (const node of oldNodes) {
      if (node.parentNode === parent) {
        parent.removeChild(node);
      }
    }

    // Insert new nodes before the marker
    for (const node of nodesToInsert) {
      parent.insertBefore(node, marker);
    }
    
    // Store the new nodes for the next render's cleanup
    lastNodesMap.set(parent, nodesToInsert);
  });
};

export const createFragment = (children: any[]) => {
  const fragment = document.createDocumentFragment();
  children.forEach(child => {
    if (child instanceof Node) {
      fragment.appendChild(child);
    } else if (typeof child !== 'undefined' && child !== null) {
      fragment.appendChild(document.createTextNode(child.toString()));
    }
  });
  return fragment;
};

export function setAttribute(el: Element, key: string, value: any) {
  if (value == null || value === false) {
    el.removeAttribute(key);
  } else {
    el.setAttribute(key, value);
  }
}

// A cache to store the master copy of the template nodes
const templateCache = new Map<string, Node>();

/**
 * Creates and caches a template node, returning a factory function
 * that produces a deep clone of the node each time it's called.
 *
 * @param html The HTML string for the template.
 * @param isSVG Whether the template is an SVG fragment.
 * @returns A factory function that returns a cloned node.
 */
export function template(html: string, isSVG: boolean = false): () => Node {
  // Use a unique key for the cache that includes the SVG flag
  const cacheKey = `${html}:${isSVG}`;
  let cachedNode = templateCache.get(cacheKey);

  // If the template is not in the cache, create it
  if (!cachedNode) {
    // Create a <template> element, which can parse HTML without rendering it
    const templateEl = document.createElement('template');
    templateEl.innerHTML = html;

    if (isSVG) {
      // The babel plugin wraps SVG fragments in an <svg> tag to ensure they
      // are parsed correctly. Get the actual element inside the wrapper.
      cachedNode = templateEl.content.firstChild!.firstChild!;
    } else {
      // For regular HTML, the node is the first child of the template's content
      cachedNode = templateEl.content.firstChild!;
    }

    // Store the master copy in the cache for future use
    templateCache.set(cacheKey, cachedNode!);
  }

  // Return a function that, when called, returns a deep clone of the cached node.
  return () => cachedNode!.cloneNode(true);
}

// Define a map to hold the delegated event listeners
const delegatedEvents = new Set();

// The delegateEvents function that the compiler expects
export function delegateEvents(events) {
  for (const name of events) {
    if (!delegatedEvents.has(name)) {
      document.addEventListener(name, eventHandler);
      delegatedEvents.add(name);
    }
  }
}

// The generic event handler that will be called for all delegated events
function eventHandler(e) {
  const key = `$$${e.type}`;
  let node = (e.composedPath && e.composedPath()[0]) || e.target;

  // Find the closest ancestor with the event handler attached
  while (node) {
    const handler = node[key];
    if (handler && !node.disabled) {
      handler(e);
      // Stop bubbling if the event is a custom event
      if (e.type.startsWith('on')) e.stopPropagation();
      return;
    }
    node = node.parentNode;
  }
}

export const memo = createMemo;

export const createComponent = (Comp: Function, props: any) => {
  return untrack(() => Comp(props));
};

// This function is called by the JSX compiler for every event attribute (e.g., `onClick`).
// It sets the event handler directly on the node and delegates the event.
export const addEventListener = (
  node: Node,
  name: string,
  handler: Function
) => {
  // Prepend '$$' to the event name to create a unique property key for the handler.
  // This is a convention of `babel-plugin-jsx-dom-expressions`.
  const propertyKey = `$$${name}`;
  (node as any)[propertyKey] = handler;

  // Call the delegateEvents function to ensure a single event listener is
  // active on the document for this event type.
  delegateEvents([name]);
};

/**
 * Handles the className attribute for JSX elements.
 * It is reactive and updates the element's class when the accessor's value changes.
 * @param node The DOM node to apply the class to.
 * @param accessor The value or a signal function that returns the class value.
 */
export const className = (node: HTMLElement, accessor: any) => {
  // Use a reactive effect to handle all class name updates
  createEffect(() => {
    // Get the current value, handling both static values and signal functions
    const value = typeof accessor === 'function' ? accessor() : accessor;

    // Based on the value's type, build the final class string
    let classes = '';
    if (typeof value === 'string') {
      classes = value;
    } else if (Array.isArray(value)) {
      // Filter out null, undefined, and false values and join the rest
      classes = value.filter(Boolean).join(' ');
    } else if (typeof value === 'object' && value !== null) {
      // For an object, include classes with truthy values
      const activeClasses = Object.entries(value)
        .filter(([, isActive]) => isActive)
        .map(([className]) => className);
      classes = activeClasses.join(' ');
    }

    // Set the className on the DOM node
    node.className = classes;
  });
};

/**
 * Executes a reactive side effect on a DOM node.
 * The effect's callback is automatically re-run whenever a signal it accesses changes.
 * @param node The DOM node on which the effect is declared.
 * @param fn The callback function to execute. It receives the `node` as its only argument.
 */
export const effect = <T>(fn: (prev: T) => T, current: T) => {
  let v = current;
  createEffect(() => {
    v = fn(v);
  });
};

/**
 * Merges multiple props arrays and objects into a single, iterable,
 * array-like props object.
 * @param args The props arrays and objects to merge.
 * @returns A single, merged props object that is array-like and iterable.
 */
export const mergeProps = (...args: any[]) => {
  const merged = {};
  let lastIndex = 0;

  // First, process all arguments and combine them into a single, flat structure
  // We do this in a single loop to correctly handle a mix of arrays and objects
  for (const props of args) {
    if (Array.isArray(props)) {
      // If it's an array, merge its elements by their index
      for (let i = 0; i < (props as any).length; i++) {
        Object.defineProperty(merged, i, Object.getOwnPropertyDescriptor(props, i)!);
        if (i >= lastIndex) {
          lastIndex = i + 1;
        }
      }
    } else {
      // If it's an object, merge its properties using the standard logic
      for (const key of Reflect.ownKeys(props)) {
        Object.defineProperty(merged, key, Object.getOwnPropertyDescriptor(props, key)!);
      }
    }
  }

  // Manually add a length property to make it array-like
  Object.defineProperty(merged, 'length', {
    value: lastIndex,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  // Manually add the Symbol.iterator to make it iterable
  merged[Symbol.iterator] = function*() {
    for (let i = 0; i < (merged as any).length; i++) {
      yield merged[i];
    }
  };

  return merged;
};

/**
 * Sets a single CSS property on an HTML element.
 * It also handles clearing the property if the value is null or undefined.
 * @param node The HTML element to style.
 * @param name The name of the CSS property (e.g., 'color', 'background-color').
 * @param value The value to set for the property.
 */
export const setStyleProperty = (node: HTMLElement, name: string, value: any) => {
  if (value === null || value === undefined) {
    // If the value is null or undefined, remove the property
    node.style.removeProperty(name);
  } else {
    // Otherwise, set the property with the given value
    node.style.setProperty(name, value);
  }
};

export function render(code: () => JSX.Element, target: HTMLElement): () => void {
  return createRoot((dispose) => {
    let node = code() as Node;
    target.appendChild(node);
    return () => {
      target.removeChild(node);
      dispose();
    };;
  });
}

export { For } from "./components.tsx";

