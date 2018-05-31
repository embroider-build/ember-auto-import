import Component from '@ember/component';
import layout from '../templates/components/hello-world';
import babelParser from '@babel/parser';
import { computed } from '@ember/object';

export default Component.extend({
  layout,
  ast: computed(function() {
    return babelParser.parse("1+1");
  })
});
