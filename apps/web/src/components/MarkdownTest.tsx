import { MarkdownContent } from "./MarkdownContent";

const testMarkdown = `# Heading 1

This is a paragraph with some **bold text** and *italic text*.

## Heading 2

Here's a list:
- Item 1
- Item 2
- Item 3

### Heading 3

And a numbered list:
1. First item
2. Second item
3. Third item

#### Code Example

Here's some inline code: \`const x = 42;\`

And a code block:

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet("World"));
\`\`\`

#### Table Example

| Feature | TypeScript | JavaScript |
|---------|-----------|------------|
| Types | Yes | No |
| Compile | Yes | No |
| Modern | Yes | Yes |

#### Blockquote

> This is a blockquote.
> It can span multiple lines.

---

#### Links

Check out [React](https://react.dev) for more info.

#### Strikethrough

~~This text is crossed out~~

#### Task List

- [x] Completed task
- [ ] Pending task
- [ ] Another pending task
`;

export function MarkdownTest() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Markdown Rendering Test</h1>

        <div className="bg-card border border-border rounded-lg p-6 shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-muted-foreground">
            Test Content Below:
          </h2>
          <div className="border-t border-border pt-4">
            <MarkdownContent content={testMarkdown} />
          </div>
        </div>

        <div className="mt-8 bg-muted/30 border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Raw Markdown Source:</h2>
          <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
            {testMarkdown}
          </pre>
        </div>
      </div>
    </div>
  );
}
