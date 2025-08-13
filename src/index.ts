export type Accessor<A> = (ret: (a: A) => void) => void;
export type Setter<A> = (x: A) => void;
export type Signal<A> = [ Accessor<A>, Setter<A>, ];

interface Node {
    age: number,
    update: () => void,
};

let time = 0;
let cursors = new Set<Node>();
let transactionDepth = 0;

function flush() {
    let oldCursors = cursors;
    cursors = new Set<Node>();
    for (let cursor of oldCursors) {
        cursor.update();
    }
}

export function batch<A>(k: () => A): A {
    let result: A;
    try {
        ++transactionDepth
        result = k();
    } finally {
        --transactionDepth;
    }
    if (transactionDepth == 0) {
        flush();
    }
    return result;
}

export function createMemo<A>(k: (ret: (a: A) => void) => void): Accessor<A> {
    let value: A | undefined = undefined;
    let hasValue = false;
    let node: Node = {
        age: time++,
        update: () => {},
    };
    throw new Error("TODO");
}

export function createSignal<A>(a: A): Signal<A> {
    let value = a;
    let nexts: (() => void)[] = [];
    let node: Node = {
        age: time++,
        update: () => {},
    };
    cursors.add(node);
    return [
        (ret) => {
            nexts.push(() => ret(value));
        },
        (x) => {
            value = x;
            cursors.add(node);
        },
    ];
}
