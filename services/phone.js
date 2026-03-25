const { parsePhoneNumberFromString } = require("libphonenumber-js");

function normalizePhone(rawPhone, defaultCountry = "US") {
  if (!rawPhone || typeof rawPhone !== "string") {
    return {
      isValid: false,
      e164: null,
      reason: "Phone number missing"
    };
  }

  const cleaned = rawPhone.trim();

  try {
    let parsed = parsePhoneNumberFromString(cleaned);
    if (!parsed && defaultCountry) {
      parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
    }

    if (!parsed) {
      return {
        isValid: false,
        e164: null,
        reason: "Unable to parse phone number"
      };
    }

    if (!parsed.isValid()) {
      return {
        isValid: false,
        e164: null,
        reason: "Phone number is not valid for the selected country"
      };
    }

    return {
      isValid: true,
      e164: parsed.number,
      country: parsed.country,
      reason: null
    };
  } catch (error) {
    return {
      isValid: false,
      e164: null,
      reason: `Phone normalization error: ${error.message}`
    };
  }
}

module.exports = {
  normalizePhone
};
