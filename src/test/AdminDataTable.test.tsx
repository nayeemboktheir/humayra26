import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * Records the PostgREST call chain AdminDataTable builds in server mode, so the
 * query shape can be asserted without a live database.
 */
const calls: any[] = [];
let nextResult: { data: any[]; count: number; error: any } = { data: [], count: 0, error: null };

function makeQuery(table: string) {
  const record: any = { table, eq: {}, or: null, order: null, range: null };
  calls.push(record);
  const q: any = {
    eq(col: string, val: any) { record.eq[col] = val; return q; },
    or(expr: string) { record.or = expr; return q; },
    order(col: string, opts: any) { record.order = { col, ...opts }; return q; },
    in(col: string, vals: any[]) { record.in = { col, vals }; return Promise.resolve({ data: [], error: null }); },
    range(from: number, to: number) {
      record.range = { from, to };
      return Promise.resolve(nextResult);
    },
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: (_cols: string, _opts?: any) => makeQuery(table),
    }),
  },
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import AdminDataTable, { type Column } from "@/components/admin/AdminDataTable";

const columns: Column[] = [
  { key: "description", label: "Description" },
  { key: "status", label: "Status" },
];

beforeEach(() => {
  calls.length = 0;
  nextResult = { data: [], count: 0, error: null };
});

describe("AdminDataTable server mode", () => {
  it("queries the table on mount with paging and ordering, not an unbounded select", async () => {
    render(
      <AdminDataTable
        title="Transactions"
        columns={columns}
        table="transactions"
        searchColumns={["description", "status"]}
        pageSize={50}
      />,
    );

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const c = calls[0];
    expect(c.table).toBe("transactions");
    expect(c.range).toEqual({ from: 0, to: 49 });
    expect(c.order).toEqual({ col: "created_at", ascending: false });
    expect(c.or).toBeNull();
  });

  it("translates the search box into a server-side ilike filter", async () => {
    render(
      <AdminDataTable
        title="Transactions"
        columns={columns}
        table="transactions"
        searchColumns={["description", "status"]}
      />,
    );
    await waitFor(() => expect(calls.length).toBe(1));

    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "refund" } });

    await waitFor(() => expect(calls.length).toBeGreaterThan(1), { timeout: 2000 });
    const last = calls[calls.length - 1];
    expect(last.or).toBe("description.ilike.%refund%,status.ilike.%refund%");
    expect(last.range).toEqual({ from: 0, to: 49 });
  });

  it("strips PostgREST filter syntax from the search term", async () => {
    render(
      <AdminDataTable
        title="T"
        columns={columns}
        table="transactions"
        searchColumns={["description"]}
      />,
    );
    await waitFor(() => expect(calls.length).toBe(1));

    fireEvent.change(screen.getByPlaceholderText("Search..."), {
      target: { value: 'a,b(c)"d%e*' },
    });

    await waitFor(() => expect(calls.length).toBeGreaterThan(1), { timeout: 2000 });
    const last = calls[calls.length - 1];
    // The surrounding %...% are our own ilike wildcards; the user-supplied term
    // between them must carry none of PostgREST's filter syntax.
    const term = last.or.replace(/^description\.ilike\.%/, "").replace(/%$/, "");
    expect(term).not.toMatch(/[,()"%*\\]/);
    expect(last.or).toBe("description.ilike.%a b c  d e%");
  });

  it("applies equality filters server-side", async () => {
    render(
      <AdminDataTable
        title="Shipments"
        columns={columns}
        table="shipments"
        filters={{ status: "Delivered" }}
      />,
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0].eq).toEqual({ status: "Delivered" });
  });

  it("hides the search box when there are no searchable columns", async () => {
    render(<AdminDataTable title="Wallets" columns={columns} table="wallets" />);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(screen.queryByPlaceholderText("Search...")).toBeNull();
  });

  it("advances the range when paging forward", async () => {
    nextResult = { data: [{ id: "1", description: "x", status: "y" }], count: 120, error: null };
    render(
      <AdminDataTable
        title="T"
        columns={columns}
        table="transactions"
        searchColumns={["description"]}
        pageSize={50}
      />,
    );
    await waitFor(() => expect(calls.length).toBe(1));

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[1].range).toEqual({ from: 50, to: 99 });
  });

  it("enriches only the fetched page via transformRows", async () => {
    nextResult = { data: [{ id: "1", user_id: "u1" }], count: 1, error: null };
    const transformRows = vi.fn(async (rows: any[]) =>
      rows.map((r) => ({ ...r, customer_name: "Ada" })),
    );

    render(
      <AdminDataTable
        title="Shipments"
        columns={[{ key: "customer_name", label: "Customer" }]}
        table="shipments"
        transformRows={transformRows}
      />,
    );

    await waitFor(() => expect(transformRows).toHaveBeenCalledTimes(1));
    expect(transformRows.mock.calls[0][0]).toEqual([{ id: "1", user_id: "u1" }]);
    await waitFor(() => expect(screen.getByText("Ada")).toBeInTheDocument());
  });

  it("still filters client-side when no table is given", async () => {
    render(
      <AdminDataTable
        title="Roles"
        columns={columns}
        data={[
          { id: "1", description: "keep", status: "a" },
          { id: "2", description: "drop", status: "b" },
        ]}
        loading={false}
      />,
    );
    expect(calls.length).toBe(0);
    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "keep" } });
    await waitFor(() => expect(screen.queryByText("drop")).toBeNull());
    expect(screen.getByText("keep")).toBeInTheDocument();
  });
});
