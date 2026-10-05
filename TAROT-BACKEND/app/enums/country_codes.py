"""A reader's ethnicity as countries (ROUND56).

ISO_COUNTRY_CODES is every officially assigned ISO 3166-1 alpha-2 code, all
249. users.ethnicity holds one or two of them, uppercase and comma separated:
"MA", or "GB,RO" for mixed heritage. The app holds the same codes with each
country's name and demonym (tarot-landing-web/src/features/client-app/
countries.ts); tarot-landing-web/scripts/test-countries.mts proves the two
lists hold exactly the same codes.

Free text stored before ROUND56 ("British Romanian") is left in its row, kept
for the owner and never shown to clients (shown_ethnicity).
"""

ISO_COUNTRY_CODES = frozenset((
    "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
    "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS",
    "BT", "BV", "BW", "BY", "BZ",
    "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW",
    "CX", "CY", "CZ",
    "DE", "DJ", "DK", "DM", "DO", "DZ",
    "EC", "EE", "EG", "EH", "ER", "ES", "ET",
    "FI", "FJ", "FK", "FM", "FO", "FR",
    "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT",
    "GU", "GW", "GY",
    "HK", "HM", "HN", "HR", "HT", "HU",
    "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT",
    "JE", "JM", "JO", "JP",
    "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
    "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
    "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS",
    "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
    "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ",
    "OM",
    "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY",
    "QA",
    "RE", "RO", "RS", "RU", "RW",
    "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS",
    "ST", "SV", "SX", "SY", "SZ",
    "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
    "UA", "UG", "UM", "US", "UY", "UZ",
    "VA", "VC", "VE", "VG", "VI", "VN", "VU",
    "WF", "WS",
    "YE", "YT",
    "ZA", "ZM", "ZW",
))

# One country, or two for mixed heritage. The owner's form reads it from the
# server (schemas/owner_readers.py OwnerReaderLimits).
ETHNICITY_MAX_COUNTRIES = 2
ETHNICITY_SEPARATOR = ","


class EthnicityRefused(ValueError):
    """Why an ethnicity is not one or two countries, in plain words."""


def ethnicity_codes(value: str) -> list[str]:
    """The countries in a stored or sent ethnicity, exactly as it must be
    written ("MA", "GB,RO"), else EthnicityRefused."""
    codes = value.split(ETHNICITY_SEPARATOR)
    if len(codes) > ETHNICITY_MAX_COUNTRIES:
        raise EthnicityRefused(f"At most {ETHNICITY_MAX_COUNTRIES} countries.")
    if any(code not in ISO_COUNTRY_CODES for code in codes):
        raise EthnicityRefused("Not a country from the ISO list. Send one or two codes, such as MA or GB,RO.")
    if len(set(codes)) != len(codes):
        raise EthnicityRefused("The two countries must be different.")
    return codes


def shown_ethnicity(stored: str | None) -> str | None:
    """Her ethnicity as clients get it: the stored codes, or None when it is
    empty or is not countries (free text kept from before ROUND56)."""
    if not stored:
        return None
    try:
        ethnicity_codes(stored)
    except EthnicityRefused:
        return None
    return stored
