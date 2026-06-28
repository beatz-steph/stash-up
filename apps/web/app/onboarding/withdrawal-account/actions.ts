"use server"

import { prisma } from "@workspace/db"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export interface Bank {
  code: string
  name: string
}

export async function getBanks(): Promise<Bank[]> {
  // Static list of major Nigerian banks
  return [
    { code: "058", name: "GTBank" },
    { code: "044", name: "Access Bank" },
    { code: "057", name: "Zenith Bank" },
    { code: "033", name: "United Bank for Africa (UBA)" },
    { code: "011", name: "First Bank of Nigeria" },
    { code: "090267", name: "Kuda Bank" },
    { code: "999992", name: "OPay" },
    { code: "999991", name: "PalmPay" },
    { code: "50515", name: "Moniepoint MFB" },
  ]
}

export async function resolveAccountName({
  bankCode,
  accountNumber,
}: {
  bankCode: string
  accountNumber: string
}): Promise<string> {
  // Input validation
  if (!bankCode) {
    throw new Error("Bank selection is required")
  }
  if (!/^\d{10}$/.test(accountNumber)) {
    throw new Error("Account number must be exactly 10 digits")
  }

  // Simulate 1 second delay to showcase loading / "Verifying..." state in UI
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // In sandbox, return a realistic name based on the account number
  // Let's use some specific values for test cases
  if (accountNumber === "0000000000") {
    throw new Error("Could not verify this account. Check the details.")
  }

  return "Aisha Bello"
}

export async function saveWithdrawalAccount({
  bankCode,
  bankName,
  accountNumber,
  accountName,
}: {
  bankCode: string
  bankName: string
  accountNumber: string
  accountName: string
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    throw new Error("Unauthorized: Please sign in")
  }

  const userId = session.user.id

  if (!bankCode || !bankName || !accountNumber || !accountName) {
    throw new Error("All withdrawal account fields are required")
  }

  if (!/^\d{10}$/.test(accountNumber)) {
    throw new Error("Invalid account number format")
  }

  try {
    const record = await prisma.withdrawalAccount.upsert({
      where: { userId },
      update: {
        bankCode,
        bankName,
        accountNumber,
        accountName,
      },
      create: {
        userId,
        bankCode,
        bankName,
        accountNumber,
        accountName,
      },
    })
    return { success: true, data: record }
  } catch (error) {
    console.error("Error saving withdrawal account:", error)
    throw new Error("Failed to save withdrawal account")
  }
}
