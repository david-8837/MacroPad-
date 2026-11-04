import React from 'react';
import * as LucideIcons from 'lucide-react';

/** Older saved decks may reference any Lucide name, not just today's picker.
 * Keep those icons working without loading the entire catalogue on startup. */
export default function LegacyKeyIcon({ name, className }: { name: string; className: string }) {
  const candidate = (LucideIcons as unknown as Record<string, unknown>)[name];
  const isIcon = !!candidate && typeof candidate === 'object' && '$$typeof' in candidate && candidate.$$typeof === Symbol.for('react.forward_ref');
  const Icon = (isIcon ? candidate : LucideIcons.Square) as React.ElementType;
  return <Icon className={className} />;
}
