'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FreshNavigation } from '../../src/components/LandingPage.jsx';
import { saveFavoritesList } from '../../src/lib/mock-state.js';
import { getCustomerFavorites, getPublicBranches, removeCustomerFavorite } from '../../src/lib/auth-api.js';
import { PROVIDER_FRONTEND_URL } from '../../src/lib/app-urls.js';
import { getSalonPath } from '../../src/lib/salon-routes.js';
import { Star, MapPin, Heart, ArrowRight, HeartCrack } from 'lucide-react';

export default function FavoritesPage() {
    const router = useRouter();
    const [favorites, setFavorites] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadFavorites = async () => {
        setError('');

        try {
            const [favIds, salons] = await Promise.all([
                getCustomerFavorites(),
                getPublicBranches(),
            ]);
            saveFavoritesList(favIds);
            const savedSalons = favIds
                .map((favoriteId) => salons.find((salon) => String(salon.id) === String(favoriteId)))
                .filter(Boolean);

            setFavorites(savedSalons);
        } catch (loadError) {
            setFavorites([]);
            setError(loadError?.message || 'Daftar favorit belum dapat dimuat.');
            if (loadError?.status === 401) {
                router.replace('/auth?next=/favorites');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadFavorites();
    }, []);

    const handleUnfavorite = async (salonId) => {
        const previous = favorites;
        setFavorites((current) => current.filter((salon) => String(salon.id) !== String(salonId)));
        try {
            await removeCustomerFavorite(salonId);
            saveFavoritesList(previous.filter((salon) => String(salon.id) !== String(salonId)).map((salon) => salon.id));
        } catch (removeError) {
            setFavorites(previous);
            setError(removeError?.message || 'Favorit belum berhasil dihapus.');
        }
    };

    return (
        <div className="page-shell">
            <FreshNavigation providerUrl={PROVIDER_FRONTEND_URL} customerAppUrl="/" />
            <main className="booking-container">
                <h1 className="favorites-title">Salon Favorit Saya</h1>
                <p className="favorites-subtitle">
                    Akses cepat ke salon, barbershop, dan spa langgananmu untuk pemesanan ulang instan.
                </p>

                {loading ? (
                    <div className="fav-empty-state" role="status" aria-live="polite">
                        <span className="booking-loading-indicator" aria-hidden="true"><span /><span /><span /></span>
                        <p>Memuat salon favorit...</p>
                    </div>
                ) : favorites.length > 0 ? (
                    <div className="favorites-grid">
                        {favorites.map(salon => (
                            <div key={salon.id} className="fav-card">
                                {/* Unfavorite Trigger Icon */}
                                <button
                                    type="button"
                                    onClick={() => handleUnfavorite(salon.id)}
                                    className="fav-remove-btn"
                                    title="Hapus dari Favorit"
                                >
                                    <Heart size={16} fill="currentColor" />
                                </button>

                                {/* Cover Image */}
                                <img 
                                    src={salon.image} 
                                    alt={salon.name} 
                                    onClick={() => router.push(getSalonPath(salon))}
                                    className="fav-card-image"
                                />

                                {/* Salon Info */}
                                <div className="fav-card-info">
                                    <div>
                                        <div className="fav-card-header">
                                            <h3 
                                                onClick={() => router.push(getSalonPath(salon))}
                                                className="fav-card-name"
                                            >
                                                {salon.name}
                                            </h3>
                                        </div>

                                        {/* Rating & Location */}
                                        <div className="fav-rating-row">
                                            <span className="fav-rating-star">
                                                <Star size={12} fill="currentColor" strokeWidth={0} />
                                                {salon.rating.toFixed(1)}
                                            </span>
                                            <span className="fav-rating-count">({salon.reviews} ulasan)</span>
                                        </div>

                                        <p className="fav-location">
                                            <MapPin size={12} />
                                            {salon.address}
                                        </p>
                                    </div>

                                    {/* Action Row */}
                                    <div className="fav-action-row">
                                        <button 
                                            className="service-select-btn" 
                                            onClick={() => router.push(getSalonPath(salon))}
                                        >
                                            View details
                                        </button>
                                        <button 
                                            className="booking-action-btn" 
                                            onClick={() => router.push(getSalonPath(salon))}
                                        >
                                            Book Now
                                            <ArrowRight size={12} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="fav-empty-state">
                        <HeartCrack size={40} className="fav-empty-icon" />
                        <h3>No favourite salons yet</h3>
                        <p className="fav-empty-desc">Save your favourite salon or barbershop for faster repeat bookings.</p>
                        <button className="coupon-btn fav-empty-btn" onClick={() => router.push('/search')}>
                            Explore Salon
                        </button>
                    </div>
                )}
                {!loading && error && <p className="favorites-load-note" role="status">{error}</p>}
            </main>
        </div>
    );
}
