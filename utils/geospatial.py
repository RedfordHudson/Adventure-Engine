from geopy.geocoders import Nominatim

geolocator = Nominatim(user_agent="socal_geocoder")

socal_viewbox = [
    (35.8, -120.5),  # northwest
    (32.5, -114.1),  # southeast
]

def address2coordinates(address: str) -> tuple[float, float] | None:
    try:
        location = geolocator.geocode(
            address,
            viewbox=socal_viewbox,
            bounded=True,
            country_codes="us",
        )

        if location is None:
            return None,None

        return location.latitude, location.longitude
    except Exception as e:
        print(f'[geospatial:exception] {address} | {e}')
        return None,None