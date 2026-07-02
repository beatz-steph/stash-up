import { render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi } from "vitest"
import { PayoutsTable } from "./payouts-table"
import * as payoutsQueries from "../queries/payouts"

vi.mock("../queries/payouts")

describe("PayoutsTable", () => {
  it("highlights FAILED payouts", () => {
    vi.mocked(payoutsQueries.usePayouts).mockReturnValue({
      data: {
        items: [
          {
            id: "p1",
            cycleId: "c1",
            amountMinor: 50000,
            nombaTransferId: "nt1",
            nombaStatus: "FAILED",
            recipientBankName: "Bank",
            recipientAccountName: "Recipient",
            status: "FAILED",
            failureReason: "Insufficient funds",
            createdAt: new Date("2023-01-01").toISOString(),
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      },
      isLoading: false,
      isError: false,
    } as never)

    const { container } = render(<PayoutsTable />)
    
    expect(screen.getByText("Insufficient funds")).toBeInTheDocument()
    
    const row = container.querySelector("tbody tr")
    expect(row).toBeInTheDocument()
    
    // Assert the failure class is present
    expect(row).toHaveClass("bg-su-semantic-down/5")
  })
})
