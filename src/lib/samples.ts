// Demo bills shipped in /public/samples. All businesses, GSTINs and numbers
// are made up.
export const SAMPLES = [
  {
    id: "intra-state",
    title: "GST tax invoice",
    note: "Mumbai supplier · CGST + SGST · 6 items",
    src: "/samples/intra-state-invoice.png",
  },
  {
    id: "inter-state",
    title: "Inter-state invoice",
    note: "Delhi supplier · IGST · freight",
    src: "/samples/inter-state-invoice.png",
  },
  {
    id: "phone-photo",
    title: "Phone photo of a bill",
    note: "Tilted, shadowed, handwritten bits",
    src: "/samples/phone-photo-bill.jpg",
  },
] as const;
