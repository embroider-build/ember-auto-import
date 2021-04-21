declare module 'broccoli-merge-trees' {
  import { InputNode, Node } from 'broccoli-node-api';
  export default function mergeTrees(trees: InputNode[], opts?: { overwrite?: boolean }): Node;
}
