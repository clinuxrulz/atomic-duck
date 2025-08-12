export type Accessor<A> = (ret: (a: A) => void) => void;
export type Setter<A> = (x: A) => void;
export type Signal<A> = [ Accessor<A>, Setter<A>, ];

interface Node {
    age: number,
    nexts: (() => void)[],
};

let time = 0;

let cursors = new Set<Node>();

export function createSignal<A>(a: A): Signal<A> {
    let value = a;
    let node: Node = {
        age: time++,
        nexts: [],
    };
    cursors.add(node);
    return [
        (ret) => {
            node.nexts.push(() => ret(value));
        },
        (x) => {
            value = x;
        },
    ];
}