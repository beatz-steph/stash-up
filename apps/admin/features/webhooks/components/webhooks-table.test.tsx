import { render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { describe, it, expect, vi } from "vitest"
import { WebhooksTable } from "./webhooks-table"
import * as webhooksQueries from "../queries/webhooks"

vi.mock("../queries/webhooks")

describe("WebhooksTable", () => {
  it("highlights webhooks with processing errors", () => {
    vi.mocked(webhooksQueries.useWebhooks).mockReturnValue({
      data: {
        items: [
          {
            id: "w1",
            providerEventId: "ev1",
            eventType: "payment_success",
            signatureValid: true,
            processed: true,
            processingError: "Webhook failed to process correctly",
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

    const { container } = render(<WebhooksTable />)
    
    expect(screen.getByText("Webhook failed to process correctly")).toBeInTheDocument()
    
    const row = container.querySelector("tbody tr")
    expect(row).toBeInTheDocument()
    
    // Assert the failure class is present
    expect(row).toHaveClass("bg-su-semantic-down/5")
  })
})
