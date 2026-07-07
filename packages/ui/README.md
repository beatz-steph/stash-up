# StashUp Shared UI (`@workspace/ui`)

This package provides a shared component library built around [shadcn/ui](https://ui.shadcn.com/) and Tailwind CSS. The components here are designed to be imported and used identically across both the `apps/web` and `apps/admin` applications, ensuring a consistent design language.

## Adding Components

To add a new shadcn component to the monorepo, run the `shadcn` CLI command from the root of the project, targeting the `apps/web` or `apps/admin` workspace (which naturally places the underlying UI code into this `packages/ui` folder):

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

This will automatically place the component inside `packages/ui/src/components`.

## Using Components

To use the components in your apps, import them via the `@workspace/ui` path alias:

```tsx
import { Button } from "@workspace/ui/components/button";
```

## Related Documentation

- **[Root Repository README](../../README.md)**
- **[Technical Documentation Hub](../../docs/README.md)**
