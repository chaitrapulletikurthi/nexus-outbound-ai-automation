const items = $input.all();
const results = [];

for (const item of items) {
  const buyer = item.json;

  // Remove spaces, brackets, dashes, and other formatting
  let digits = String(buyer.phone || '').replace(/\D/g, '');

  // Convert US 10-digit numbers to international format
  if (digits.length === 10) {
    digits = '1' + digits;
  }

  // Accept US numbers with a country code
  if (!/^1[2-9]\d{2}[2-9]\d{6}$/.test(digits)) {
    continue;
  }

  results.push({
    json: {
      ...buyer,
      phone: '+' + digits
    }
  });
}

return results;
