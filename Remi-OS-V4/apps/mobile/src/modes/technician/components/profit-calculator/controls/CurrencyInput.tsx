import { NumberInput } from "./NumberInput";

type Props = React.ComponentProps<typeof NumberInput>;

export function CurrencyInput(props: Props) {
  return <NumberInput prefix="$" decimals={0} min={0} {...props} />;
}
