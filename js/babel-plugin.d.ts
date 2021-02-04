import { NodePath } from '@babel/core';
import { Import } from '@babel/types';
declare function emberAutoImport(): {
    inherits: any;
    visitor: {
        Import(path: NodePath<Import>): void;
    };
};
declare namespace emberAutoImport {
    var baseDir: () => string;
}
export = emberAutoImport;
