import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Auth from "@/pages/Auth";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  setSession: vi.fn(),
  getUser: vi.fn(),
  navigate: vi.fn(),
  markNotice: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    auth: {
      signInWithPassword: vi.fn(),
      setSession: mocks.setSession,
      getUser: mocks.getUser,
      verifyOtp: vi.fn(),
    },
  },
}));

vi.mock("@/lib/roles", () => ({
  resolveUserRole: vi.fn(async () => "customer"),
  isStaffRole: vi.fn(() => false),
}));

vi.mock("@/components/SignupImportantNotice", () => ({
  markSignupNoticePending: mocks.markNotice,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mocks.navigate };
});

describe("phone-verified signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("shows one signup form with the server-verified submit action", () => {
    render(<MemoryRouter><Auth /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "একাউন্ট নেই? সাইন আপ করুন" }));

    expect(screen.getByPlaceholderText("ইমেইল")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("01XXXXXXXXX")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "মোবাইল যাচাই করে একাউন্ট তৈরি করুন" }))
      .toBeInTheDocument();
  });

  it("hands returned tokens to setSession and routes to the dashboard", async () => {
    mocks.invoke
      .mockResolvedValueOnce({ data: { success: true }, error: null })
      .mockResolvedValueOnce({
        data: { access_token: "access-token", refresh_token: "refresh-token" },
        error: null,
      });

    const { container } = render(<MemoryRouter><Auth /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "একাউন্ট নেই? সাইন আপ করুন" }));
    fireEvent.change(screen.getByPlaceholderText("পুরো নাম"), { target: { value: "Tanvir Alam" } });
    fireEvent.change(screen.getByPlaceholderText("ইমেইল"), { target: { value: "tanvir@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("পাসওয়ার্ড"), { target: { value: "secret12" } });
    fireEvent.change(screen.getByPlaceholderText("01XXXXXXXXX"), { target: { value: "01304775767" } });
    fireEvent.click(screen.getByRole("button", { name: "OTP পাঠান" }));

    const otpInput = await waitFor(() => {
      const input = container.querySelector<HTMLInputElement>("input[data-input-otp]");
      expect(input).not.toBeNull();
      return input!;
    });
    fireEvent.change(otpInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "মোবাইল যাচাই করে একাউন্ট তৈরি করুন" }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenLastCalledWith("register-with-phone", {
      body: {
        fullName: "Tanvir Alam",
        email: "tanvir@example.com",
        password: "secret12",
        phone: "01304775767",
        otp: "123456",
      },
    }));
    expect(mocks.setSession).toHaveBeenCalledWith({
      access_token: "access-token",
      refresh_token: "refresh-token",
    });
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/dashboard"));
  });
});

