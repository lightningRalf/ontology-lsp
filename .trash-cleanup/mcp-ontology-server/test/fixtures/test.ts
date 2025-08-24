// Test fixture for integration tests

export class TestClass {
  private property: string

  constructor(value: string) {
    this.property = value
  }

  TestFunction(): void {
    console.log("Test function")
  }
}

export function OldClass() {
  return "This should be renamed"
}

interface TestInterface {
  method(): void
  property: string
}