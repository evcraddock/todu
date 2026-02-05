# Code Standards

## Formatting

Use Biome or Prettier. Run before committing:

```bash
npm run format
```

## Linting

Use ESLint or Biome:

```bash
npm run lint
```

## TypeScript

### Strict Mode

TypeScript strict mode is enabled. No implicit `any`, strict null checks.

```typescript
// ❌ Bad
const data = response as any;

// ✅ Good
const data: ApiResponse = response;
```

### Types

- Define types for all function parameters and return values
- Use interfaces for object shapes
- Export types that are part of public API

```typescript
interface Post {
  id: number;
  title: string;
  content: string;
}

function createPost(data: CreatePostInput): Promise<Post> {
  // ...
}
```

### Null Handling

- Use optional chaining (`?.`) and nullish coalescing (`??`)
- Handle null cases explicitly

```typescript
const title = post.title ?? "Untitled";
const author = post.author?.name;
```

## Imports

- Use path aliases (`@/...`)
- Group: external, internal, relative

```typescript
// External
import { Hono } from "hono";

// Internal
import { db } from "@/db";

// Relative
import { validate } from "./validation";
```

## Exports

- Use named exports (not default)
- Re-export from index.ts for public API

## Functions

- Keep functions small (<30 lines)
- Single responsibility
- Use object params for 3+ parameters

## Error Handling

- Throw errors for exceptional cases
- Include context in error messages

```typescript
if (!post) {
  throw new Error(`Post not found: ${id}`);
}
```

## Testing

- Use Vitest or Jest
- Test all public functions
- Use describe/it blocks

```typescript
describe("createPost", () => {
  it("creates post with title and content", async () => {
    const post = await createPost({ title: "Test", content: "..." });
    expect(post.title).toBe("Test");
  });
});
```
