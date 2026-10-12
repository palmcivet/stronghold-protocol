/** A reference that names a case missing from the enumerated cases. */
export interface DanglingReference {
  /** Owner of the reference, e.g. the mapping entry or trace rule id. */
  readonly id: string;
  readonly reference: string;
}

/** References whose target is not among `cases`, in input order. */
export function danglingReferences(
  references: Iterable<readonly [id: string, reference: string]>,
  cases: Iterable<string>,
): readonly DanglingReference[];
