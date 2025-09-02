const Impressum = () => {
    return (
        <div className="max-w-3xl mx-auto px-4 py-10">
            <h1 className="text-2xl font-semibold mb-4">Impressum</h1>
            <div className="space-y-4 text-gray-800">
                <div>
                    TSV Bad Überkingen 1889 e.V.<br />
                    Türkheimer Str. 21<br />
                    73337 Bad Überkingen
                </div>
                <div>
                    <h2 className="font-medium">Vertreten durch</h2>
                    <p>Frederic Metzler</p>
                </div>
                <div>
                    <h2 className="font-medium">Kontakt</h2>
                    <p>
                        Telefon: 07331 931925<br />
                        E-Mail: admin@tsv-bue-tennis.de
                    </p>
                </div>
                <div>
                    <h2 className="font-medium">Registereintrag</h2>
                    <p>Vereinsregister: 540148<br />
                        Registergericht: Amtsgericht Ulm</p>
                </div>
                <div>
                    <h2 className="font-medium">Haftungsausschluss</h2>
                    <p>Haftung für Inhalte/Links gemäß §§ 7–10 TMG. Inhalte werden mit größter Sorgfalt erstellt, für Richtigkeit, Vollständigkeit und Aktualität übernehmen wir keine Gewähr.</p>
                </div>
            </div>
        </div>
    );
};

export default Impressum;
