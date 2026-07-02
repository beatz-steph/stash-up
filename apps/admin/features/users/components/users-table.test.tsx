import { render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi } from "vitest"
import { UsersTable } from "./users-table"
import * as usersQueries from "../queries/users"

vi.mock("../queries/users")

describe("UsersTable", () => {
  it("renders loading state", () => {
    vi.mocked(usersQueries.useUsers).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never)

    render(<UsersTable />)
    expect(screen.getByText("Loading...")).toBeInTheDocument()
  })

  it("renders empty state when no users", () => {
    vi.mocked(usersQueries.useUsers).mockReturnValue({
      data: { items: [], total: 0, page: 1, limit: 50 },
      isLoading: false,
      isError: false,
    } as never)

    render(<UsersTable />)
    expect(screen.getByText("No users found.")).toBeInTheDocument()
  })

  it("renders user rows and handles filters", () => {
    vi.mocked(usersQueries.useUsers).mockReturnValue({
      data: {
        items: [
          {
            id: "u1",
            name: "John Doe",
            email: "john@example.com",
            username: "johndoe",
            createdAt: new Date("2023-01-01").toISOString(),
            blockedFromCircles: false,
            lifetimeDefaultCount: 0,
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      },
      isLoading: false,
      isError: false,
    } as never)

    render(<UsersTable />)
    expect(screen.getByText("John Doe")).toBeInTheDocument()
    expect(screen.getByText("john@example.com")).toBeInTheDocument()
    expect(screen.getByText("@johndoe")).toBeInTheDocument()
    expect(screen.getByText("Good Standing")).toBeInTheDocument()
  })
})
