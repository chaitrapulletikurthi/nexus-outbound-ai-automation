const matchedBuyers = $('Match Buyers to Deals').all();

const results = [];

// Convert values into safe strings
function cleanText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.filter(Boolean).join(', ');
  }

  return String(value).trim();
}

// Format monetary values for voice conversations
function formatMoney(value) {
  if (value === null || value === undefined || value === '') {
    return 'Not specified';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return cleanText(value);
  }

  return '$' + number.toLocaleString('en-US', {
    maximumFractionDigits: 0
  });
}

// Process each buyer
for (const item of matchedBuyers) {
  const buyer = item.json;

  const topDeals = Array.isArray(buyer.topDeals)
    ? buyer.topDeals.slice(0, 3)
    : [];

  if (topDeals.length === 0) {
    continue;
  }

  // Format the three deals for NEXUS
  const properties = topDeals.map((deal, index) => ({
    rank: index + 1,
    dealId: deal.dealId,
    matchedMetroId: deal.matchedMetroId,
    city: cleanText(deal.city),
    metro: cleanText(deal.metro),
    summary: cleanText(deal.dealSummary),
    description: cleanText(deal.marketingSnippet),
    entryFee: deal.entryFee ?? null,
    entryFeeFormatted: formatMoney(deal.entryFee)
  }));

  const primaryProperty = properties[0];

  const alternativeProperties = properties.slice(1);

  // Prepare a readable property briefing for the AI agent
  const propertyBriefing = properties.map(property => {
    return [
      `Property ${property.rank}`,
      `Deal ID: ${property.dealId}`,
      `City: ${property.city}`,
      `Metro: ${property.metro}`,
      `Summary: ${property.summary}`,
      `Participation Fee: ${property.entryFeeFormatted}`,
      `Details: ${property.description}`
    ].join('\n');
  }).join('\n\n');

  // Instructions that can be supplied to the Vapi assistant
  const agentInstructions = `
You are PROPERTY ASSISTANT, the AI voice assistant for Example Property Company.

You are speaking with ${cleanText(buyer.buyerName)}.

Your purpose is to discuss available real estate investment
opportunities that match the buyer's preferred metro areas.

CONVERSATION RULES:

1. Introduce yourself as PROPERTY ASSISTANT from Example Property Company.
2. Explain that you are an AI assistant.
3. Ask whether this is a convenient time to discuss a property.
4. Begin with Property 1 only if the buyer agrees.
5. Describe the property naturally and concisely.
6. Ask whether the buyer is interested.
7. If interested, capture the exact Deal ID and request
   a follow-up from the property team.
8. If not interested, ask whether the buyer would like
   to hear about another opportunity.
9. If the buyer agrees, discuss Property 2, then Property 3.
10. Never automatically pitch every property.
11. Never invent prices, property specifications,
    availability, or financing terms.
12. If the buyer declines further discussion, end politely.
13. If the buyer asks not to be contacted again,
    acknowledge the request and flag it for suppression.
14. Do not promise that a deal is reserved or guaranteed.
15. Follow the configured call-recording disclosure
    and company policies.

AVAILABLE PROPERTIES:

${propertyBriefing}
`.trim();

  results.push({
    json: {
      buyerId: buyer.buyerId,
      buyerName: cleanText(buyer.buyerName),
      phone: cleanText(buyer.phone),

      totalMatchingDeals: buyer.totalMatchingDeals,
      selectedDealCount: properties.length,

      primaryProperty,
      alternativeProperties,
      topDeals: properties,

      propertyBriefing,
      agentInstructions,

      // Preparation status only
      outreachStatus: 'Pending Review'
    }
  });
}

return results;
