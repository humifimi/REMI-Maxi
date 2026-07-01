import { NumberInput } from "./NumberInput";

type Props = React.ComponentProps<typeof NumberInput>;

export function PercentInput(props: Props) {
  return <NumberInput suffix="%" decimals={1} min={0} {...props} />;
}
