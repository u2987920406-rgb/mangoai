import { STATUS_STYLES } from "./constants.js";

export default function StatusDot({ status }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.idle;
  return (
    <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${s.dot}`} title={s.label} />
  );
}
