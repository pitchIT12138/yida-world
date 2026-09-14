import {it,expect} from 'vitest';import {modelJSON} from '../server/model-json';
it('records the observed missing array closer without editing code strings',()=>{const code='if(x){console.log("[}] \\\"quote\\\"")}';const raw='{"design":{"components":[{"js":'+JSON.stringify(code)+'}},"version":1}';const r=modelJSON(raw);expect(r.normalizations).toHaveLength(1);expect(r.value.design.components[0].js).toBe(code);expect(r.value.version).toBe(1)});
it('does not repair truncation, missing fields, unsafe ambiguity or arbitrary syntax',()=>{for(const raw of ['{"a":[{"x":1}', '{"a":}', '{"a":"cut', '{"a":[1}', '{"a":2,}'])expect(()=>modelJSON(raw)).toThrow()});
it('keeps valid fenced JSON unchanged',()=>{expect(modelJSON('```json\n{"a":[]}\n```')).toEqual({value:{a:[]},normalizations:[]})});

it('closes an object array before the following property and preserves code bytes',()=>{const code='const x = [{a:1}]; console.log("components:")';const r=modelJSON('{"decisions":[{"js":'+JSON.stringify(code)+'},"components":[]}');expect(r.value).toEqual({decisions:[{js:code}],components:[]});expect(r.normalizations).toHaveLength(1)});
