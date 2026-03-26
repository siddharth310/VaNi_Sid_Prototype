/** Safe fallback copy — no PHI */
export const SAFE_FALLBACKS = {
  clinical_advice:
    "That's a great question for your doctor. I can help you book an appointment to discuss this — would that be helpful?",
  phi_blocked:
    'To keep your information safe, I need to verify your identity first. Could you please share your UHID and date of birth?',
  emergency:
    'This sounds urgent. Please call 112 right away. I am alerting our medical team now. Are you safe at this moment?',
  low_confidence:
    'I want to make sure you get exactly the right help. Let me connect you with one of our staff members — one moment.',
  clinical_boundary:
    "I'm not able to advise on that, but your doctor absolutely can. Would you like me to help you schedule an appointment?",
} as const;
