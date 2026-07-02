# API Pagination Convention

The StashUp Admin API uses a **page/limit** pagination pattern for list endpoints.

## Request Format

Clients should pass `page` and `limit` as query parameters.

- `page`: The current page number (1-indexed). Defaults to `1`.
- `limit`: The number of items per page. Defaults to `50`. Clamped server-side to a maximum of `100`.

Example:
`GET /api/users?page=2&limit=25`

## Query Parsing (Zod)

In the route handlers, we parse and coerce these values using Zod:

```ts
import { z } from "zod"

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
```

## Response Format

List endpoints wrap the returned array in a pagination envelope indicating total items and current view.

```ts
{
  items: T[],    // The actual array of records
  total: number, // Total records matching the query in the database
  page: number,  // Current page
  limit: number  // Current limit applied
}
```

Example response:
```json
{
  "items": [
    { "id": "user_123", "name": "Alice" },
    { "id": "user_456", "name": "Bob" }
  ],
  "total": 45,
  "page": 1,
  "limit": 50
}
```
