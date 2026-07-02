import { render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi } from "vitest"
import { ReconciliationTable } from "./reconciliation-table"
import * as reconciliationQueries from "../queries/reconciliation"

vi.mock("../queries/reconciliation")

describe("ReconciliationTable", () => {
  it("highlights attention rows for unmatched transfers", () => {
    vi.mocked(reconciliationQueries.useReconciliationQueue).mockReturnValue({
      data: {
        items: [
          {
            id: "t1",
            provider: "NOMBA",
            nombaTransactionId: "txn1",
            amountMinor: 500000,
            currency: "NGN",
            senderName: "Test Sender",
            senderBank: "Test Bank",
            senderAccountNumber: "1234",
            narration: "Test",
            matchStatus: "UNMATCHED",
            receivedAt: new Date("2023-01-01").toISOString(),
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      },
      isLoading: false,
      isError: false,
    } as never)

    const { container } = render(<ReconciliationTable />)
    
    expect(screen.getByText("Test Sender")).toBeInTheDocument()
    
    // Find the row (tr) containing the transaction
    const row = container.querySelector("tbody tr")
    expect(row).toBeInTheDocument()
    
    // Assert the attention class is present
    expect(row).toHaveClass("bg-su-accent-yellow/5")
  })
})
