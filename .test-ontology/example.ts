export class AsyncEnhancedGrep {
  constructor() {
    console.log('AsyncEnhancedGrep constructor');
  }
  
  search() {
    return 'search result';
  }
}

export function testFunction() {
  const grep = new AsyncEnhancedGrep();
  return grep.search();
}