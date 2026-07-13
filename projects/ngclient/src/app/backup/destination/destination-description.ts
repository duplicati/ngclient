export function resolveSourceDescription(
  sourceDescription: string | null | undefined,
  serverDescription: string | null | undefined,
  destinationDescription: string
) {
  return sourceDescription ?? serverDescription ?? destinationDescription;
}

export function getDisplayedDescription(
  item: { description: string; sourceDescription: string | null },
  showAsSource: boolean
) {
  return showAsSource ? (item.sourceDescription ?? item.description) : item.description;
}
