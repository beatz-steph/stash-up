export function createMockNombaResponses() {
  return {
    createVirtualAccount: {
      accountId: "va-123",
      accountNumber: "1234567890",
      accountName: "StashUp / Test User",
      bankName: "Nomba Bank",
      currency: "NGN",
    },
  };
}
