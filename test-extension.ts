// Test file for Ontology LSP extension

class TestClass {
    private name: string;
    
    constructor(name: string) {
        this.name = name;
    }
    
    greet(): string {
        return `Hello, ${this.name}!`;
    }
}

function testFunction(input: number): number {
    return input * 2;
}

const instance = new TestClass("Ontology");
console.log(instance.greet());
console.log(testFunction(21));

// Test hover, go to definition, and rename on these symbols