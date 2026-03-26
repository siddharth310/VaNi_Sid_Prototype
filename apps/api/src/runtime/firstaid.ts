/** Keyword → first-aid guidance (spec Section 8.4) */
export const firstAidGuidance: Record<string, string> = {
  chest_pain:
    'If experiencing chest pain: sit or lie down comfortably, loosen tight clothing, do not eat or drink, chew aspirin only if prescribed/not allergic, and call emergency services if pain is severe or spreading.',
  breathing_difficulty:
    'If having difficulty breathing: sit upright, lean slightly forward, breathe slowly, use a rescue inhaler if prescribed, and seek emergency care if not improving.',
  severe_bleeding:
    'If bleeding severely: apply firm direct pressure with a clean cloth, add more on top if soaked, elevate if possible, and call emergency services.',
  loss_of_consciousness:
    'If someone is unconscious: check breathing, place in recovery position, do not give anything by mouth, call emergency services immediately.',
  seizure:
    'During a seizure: clear hard objects, do not restrain, protect the head, time the seizure, call emergency if longer than five minutes.',
  stroke:
    'Stroke warning: Face drooping, Arm weakness, Speech difficulty — time to call emergency services immediately. Do not give anything by mouth.',
  high_fever_child:
    'High fever in a child: remove extra clothing, use age-appropriate fever medicine if available, offer fluids, seek emergency care for very high fever or lethargy.',
  allergic_reaction:
    'Severe allergic reaction: use epinephrine auto-injector if available, call emergency services, lay flat with legs elevated unless breathing is difficult.',
  suicidal:
    'If you are thinking about harming yourself, please reach out to local crisis lines or emergency services immediately. You are not alone.',
};

const TRIGGERS: { keys: RegExp; id: keyof typeof firstAidGuidance }[] = [
  { keys: /chest\s+pain|heart\s+pain/i, id: 'chest_pain' },
  { keys: /can('t|not)\s+breathe|short(ness)?\s+of\s+breath|breathing\s+difficult/i, id: 'breathing_difficulty' },
  { keys: /bleeding\s+heavily|severe\s+bleeding/i, id: 'severe_bleeding' },
  { keys: /unconscious|lost\s+consciousness|passed\s+out/i, id: 'loss_of_consciousness' },
  { keys: /seizure|convuls/i, id: 'seizure' },
  { keys: /stroke|face\s+droop|slurred\s+speech|weakness\s+on\s+one\s+side/i, id: 'stroke' },
  { keys: /high\s+fever.*child|child.*fever.*10[4-5]/i, id: 'high_fever_child' },
  { keys: /severe\s+allergic|anaphylaxis|throat\s+closing/i, id: 'allergic_reaction' },
  { keys: /suicid|kill\s+myself|want\s+to\s+die|end\s+my\s+life/i, id: 'suicidal' },
];

export function detectFirstAidTrigger(text: string): keyof typeof firstAidGuidance | null {
  for (const t of TRIGGERS) {
    if (t.keys.test(text)) {
      return t.id;
    }
  }
  return null;
}

export function getFirstAidInjection(trigger: keyof typeof firstAidGuidance): string {
  return firstAidGuidance[trigger] ?? '';
}
