export const splitSize = (value: string) => {
  if (!value || typeof value !== 'string' || value.length === 0) return { size: 0, unit: 'MB' };

  const match = value.match(/^(\d+)(bytes|kb|mb|gb|tb|pb|b|kib|mib|gib|tib|pib)$/i);

  if (match && (match[2].toUpperCase() === 'B' || match[2].toUpperCase() === 'BYTES')) {
    return {
      size: 1,
      unit: 'KB',
    };
  }

  return {
    size: match ? parseInt(match[1], 10) : 0,
    unit: match ? match[2].toUpperCase() : 'MB',
  };
};
