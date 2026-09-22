import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResetPassword from "@/pages/ResetPassword";

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: mocks.onAuthStateChange,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      exchangeCodeForSession: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("ResetPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  it("requests a reset link with the dedicated return route", async () => {
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText("ইমেইল"), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "রিসেট লিংক পাঠান" }));

    await waitFor(() => expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      "user@example.com",
      { redirectTo: `${window.location.origin}/reset-password` },
    ));
  });
});

