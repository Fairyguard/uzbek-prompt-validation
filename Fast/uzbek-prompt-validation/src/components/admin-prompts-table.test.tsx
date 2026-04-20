import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PromptStatus } from "@prisma/client";
import type { AnchorHTMLAttributes } from "react";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/app/actions", () => ({
  bulkDeletePromptsAction: vi.fn(),
}));

import { AdminPromptsTable } from "@/components/admin-prompts-table";

const prompts = [
  {
    id: "prompt-1",
    promptId: "P-001",
    category: "safety",
    status: PromptStatus.PENDING_REVIEW,
    reviewProgress: "0/2",
    intentProgress: "Off",
    latestReviewerSummary: "-",
    latestIntentSummary: "-",
    spotCheckResult: "-",
    finalStatus: "-",
    updatedAtLabel: "20 Apr 2026, 12:00",
    detailHref: "/admin/prompts/prompt-1",
  },
  {
    id: "prompt-2",
    promptId: "P-002",
    category: "policy",
    status: PromptStatus.IN_REVIEW,
    reviewProgress: "1/2",
    intentProgress: "Off",
    latestReviewerSummary: "KEEP",
    latestIntentSummary: "-",
    spotCheckResult: "-",
    finalStatus: "-",
    updatedAtLabel: "20 Apr 2026, 12:30",
    detailHref: "/admin/prompts/prompt-2",
  },
];

describe("AdminPromptsTable", () => {
  it("keeps bulk delete disabled until at least one prompt is selected", async () => {
    const user = userEvent.setup();

    render(<AdminPromptsTable prompts={prompts} returnTo="/admin/prompts?datasetId=demo" />);

    const deleteButton = screen.getByRole("button", { name: "Delete selected" });
    expect(deleteButton).toBeDisabled();

    await user.click(screen.getByLabelText("Select prompt P-001"));

    expect(deleteButton).toBeEnabled();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("supports selecting and clearing all visible prompts", async () => {
    const user = userEvent.setup();

    render(<AdminPromptsTable prompts={prompts} returnTo="/admin/prompts" />);

    const selectAll = screen.getByLabelText("Select all visible prompts");
    const firstPrompt = screen.getByLabelText("Select prompt P-001");
    const secondPrompt = screen.getByLabelText("Select prompt P-002");

    await user.click(selectAll);

    expect(firstPrompt).toBeChecked();
    expect(secondPrompt).toBeChecked();
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    await user.click(selectAll);

    expect(firstPrompt).not.toBeChecked();
    expect(secondPrompt).not.toBeChecked();
    expect(screen.getByText("0 selected")).toBeInTheDocument();
  });
});
