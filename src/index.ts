export type Accessor<A> = (ret: (a: A) => void) => void;
export type Setter<A> = (x: A) => void;
export type Signal<A> = [ Accessor<A>, Setter<A>, ];

interface Node {
    update: () => void,
};

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
    let nexts: (() => void)[] = [];
    let nexts2: (() => void)[] = [];
    let node: Node = {
        update: () => {
            let tmp = nexts;
            nexts = nexts2;
            nexts2 = tmp;
            for (let next of nexts2) {
                next();
            }
            nexts2.splice(0, nexts2.length);
        },
    };
    k((a) => {
        value = a;
        hasValue = true;
    });
    let result: Accessor<A> = (ret) => {
        if (!hasValue) {
            cursors.add(node);
            nexts.push(() => result(ret));
        } else {
            ret(value as A);
        }
    };
    return result;
}

export function createSignal<A>(a: A): Signal<A> {
    let value = a;
    let nexts: (() => void)[] = [];
    let nexts2: (() => void)[] = [];
    let node: Node = {
        update: () => {
            let tmp = nexts;
            nexts = nexts2;
            nexts2 = tmp;
            for (let next of nexts2) {
                next();
            }
            nexts2.splice(0, nexts2.length);
        },
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
