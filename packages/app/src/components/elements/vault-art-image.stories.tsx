import type { Meta, StoryObj } from "@storybook/react-vite";
import { VAULT_ART } from "./vault-art";
import { VaultArtImage } from "./vault-art-image";

const meta = {
  title: "Elements/VaultArtImage",
  component: VaultArtImage,
  parameters: { layout: "centered" },
  args: { name: "deposit", px: 44, className: "drawer-icon size-11" },
  decorators: [(Story) => <div className="bg-secondary p-4"><Story /></div>],
} satisfies Meta<typeof VaultArtImage>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Deposit: the gold coin into the piggy bank, under a green arrow (the footer's tab, its section). */
export const Deposit: Story = {};
/** Withdraw: the coin out, under an orange arrow. */
export const Withdraw: Story = { args: { name: "withdraw" } };
/** The exit fee: the coin with its red "%" tag. */
export const ExitFee: Story = { args: { name: "exit-fee" } };
/** The three at the sizes the page draws them: 44 (the tiles), 32 (the footer's tabs), 28 (the titles), 20 (the notes). */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {([[44, "size-11"], [32, "size-8"], [28, "size-7"], [20, "size-5"]] as const).map(([px, size]) => (
        <div key={px} className="flex items-center gap-3">
          {VAULT_ART.map((name) => (
            <VaultArtImage key={name} name={name} px={px} className={`drawer-icon ${size}`} />
          ))}
        </div>
      ))}
    </div>
  ),
};
