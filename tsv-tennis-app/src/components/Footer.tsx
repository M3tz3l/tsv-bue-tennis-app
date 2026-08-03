import { Link } from "react-router-dom";

const Footer = () => {
    return (
        <footer className="mt-8 border-t border-[var(--hairline)] py-6 text-sm text-[var(--body)]">
            <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-center sm:text-left">© {new Date().getFullYear()} TSV Bad Überkingen 1889 e.V.</p>
                <nav className="flex items-center gap-4">
                    <Link to="/impressum" className="hover:text-[var(--ink)] underline-offset-4 hover:underline">
                        Impressum
                    </Link>
                    <span className="text-[var(--hairline-strong)]">•</span>
                    <Link to="/datenschutz" className="hover:text-[var(--ink)] underline-offset-4 hover:underline">
                        Datenschutz
                    </Link>
                </nav>
            </div>
        </footer>
    );
};

export default Footer;
