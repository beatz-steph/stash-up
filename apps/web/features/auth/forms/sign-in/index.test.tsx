import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignInForm } from "./index";
import { authClient } from "../../../../lib/auth-client";

vi.mock("../../../../lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: vi.fn(),
    },
  },
}));

describe("SignInForm", () => {
  it("renders the form", () => {
    render(<SignInForm />);
    expect(screen.getByText("Welcome to StashUp")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("validates empty fields", async () => {
    render(<SignInForm />);
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: "Sign in" });
    await user.click(button);
    
    await waitFor(() => {
      expect(screen.getByText("Invalid email address")).toBeInTheDocument();
      expect(screen.getByText("Password must be at least 6 characters")).toBeInTheDocument();
    });
    expect(authClient.signIn.email).not.toHaveBeenCalled();
  });
});
