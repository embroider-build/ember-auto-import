import { Compilation } from 'webpack';
import Webpack from 'webpack';

/* 
  This does pattern replacement in the *output* bundles, so it can replace
  webpack's own emitted code, rather than just replacing things in app code.
*/
export default class ReplacePlugin {
  constructor(private patterns: [RegExp, string][]) {}
  apply(compiler: Webpack.Compiler) {
    compiler.hooks.compilation.tap('EAIReplacePlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'EAIReplacePlugin',
          stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        () => {
          for (let chunk of compilation.chunks) {
            for (let file of chunk.files) {
              compilation.updateAsset(file, (old) => {
                let replaced = new Webpack.sources.ReplaceSource(old);
                let input = old.source().toString();
                for (let [pattern, replacement] of this.patterns) {
                  for (let match of input.matchAll(pattern)) {
                    replaced.replace(
                      match.index!,
                      match.index! + match[0].length - 1,
                      replacement
                    );
                  }
                }
                return replaced;
              });
            }
          }
        }
      );
    });
  }
}
