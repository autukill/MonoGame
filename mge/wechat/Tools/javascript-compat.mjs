import {tokenizer} from './acorn.mjs';
// Native glue helpers depend on retained imports, so literal counts vary by game.
// Tokenization preserves comments/strings and exact integer values; WeChat has
// BigInt at runtime but its upload parser accepts the ES2019 grammar.
export function normalizeBigIntLiterals(source){
 const edits=[];for(const token of tokenizer(source,{ecmaVersion:'latest',sourceType:'module'}))if(typeof token.value==='bigint')edits.push({start:token.start,end:token.end,text:'BigInt('+JSON.stringify(token.value.toString())+')'});
 let code=source;for(let i=edits.length-1;i>=0;i--){const e=edits[i];code=code.slice(0,e.start)+e.text+code.slice(e.end);}
 return {code,count:edits.length};
}
