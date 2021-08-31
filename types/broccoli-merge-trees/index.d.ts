declare module 'broccoli-merge-trees' {
  import type { InputNode, Node } from 'broccoli-node-api';
  export default function mergeTrees(trees: InputNode[], opts?: { overwrite?: boolean }): Node;
}
