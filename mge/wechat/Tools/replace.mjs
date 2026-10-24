export function replaceOnce(source,from,to,label){const count=source.split(from).length-1;if(count!==1)throw Error(label+' matched '+count+' times');return source.replace(from,to);}
