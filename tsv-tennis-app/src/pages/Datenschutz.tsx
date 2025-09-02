const TODAY = new Date().toLocaleDateString('de-DE');

const Datenschutz = () => {
    return (
        <div className="max-w-3xl mx-auto px-4 py-10">
            <h1 className="text-2xl font-semibold mb-4">Datenschutzerklärung</h1>
            <div className="space-y-5 text-gray-800">
                <section>
                    <h2 className="font-medium">1. Verantwortlicher</h2>
                    <p>
                        TSV Bad Überkingen 1889 e.V. – Tennisabteilung<br />
                        Türkheimer Str. 21, 73337 Bad Überkingen<br />
                        Telefon: 07331 931925<br />
                        Verantwortlich: Frederic Metzler<br />
                        E-Mail: admin@tsv-bue-tennis.de
                    </p>
                </section>

                <section>
                    <h2 className="font-medium">2. Hosting (Hetzner)</h2>
                    <p>
                        Diese Anwendung wird bei Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Deutschland gehostet. Es besteht ein
                        Auftragsverarbeitungsvertrag gem. Art. 28 DSGVO. Die Verarbeitung erfolgt auf Servern in der EU/Deutschland. Ein
                        Drittlandtransfer findet durch das Hosting nicht statt.
                    </p>
                </section>

                <section>
                    <h2 className="font-medium">3. Server-Logfiles</h2>
                    <p>Bei jedem Aufruf werden technisch bedingt folgende Daten verarbeitet:</p>
                    <ul className="list-disc ml-6">
                        <li>IP-Adresse, Datum und Uhrzeit des Zugriffs</li>
                        <li>aufgerufene URL/Resource, HTTP-Statuscode</li>
                        <li>Referrer (sofern übermittelt), User-Agent</li>
                    </ul>
                    <p>
                        Zwecke: Betrieb, Sicherheit, Fehleranalyse (Art. 6 Abs. 1 lit. f DSGVO). Speicherdauer in der Regel 7–14 Tage, längstens
                        bis zur Klärung von Sicherheitsvorfällen. Keine Zusammenführung mit anderen Daten.
                    </p>
                </section>

                <section>
                    <h2 className="font-medium">4. Verarbeitete Anwendungsdaten</h2>
                    <ul className="list-disc ml-6">
                        <li>Login-Daten (E-Mail); Passwort-Hash wird nur serverseitig verarbeitet</li>
                        <li>Arbeitsstunden (Datum, Tätigkeit, Stunden) und interne IDs</li>
                        <li>Fehler-/Zugriffsprotokolle (siehe Server-Logfiles)</li>
                    </ul>
                </section>

                <section>
                    <h2 className="font-medium">5. Zwecke und Rechtsgrundlagen</h2>
                    <p>
                        Verwaltung der Mitglieder-Arbeitsstunden und Konten auf Basis der Satzung/vertraglicher Pflichten (Art. 6 Abs. 1 lit. b DSGVO)
                        sowie berechtigter Interessen (Betrieb, IT-Sicherheit; Art. 6 Abs. 1 lit. f DSGVO).
                    </p>
                </section>

                <section>
                    <h2 className="font-medium">6. Cookies und Storage</h2>
                    <p>
                        Es werden keine Tracking-Cookies eingesetzt. Zur Authentifizierung wird ein Token im localStorage Ihres Browsers gespeichert
                        und bis zum Logout vorgehalten. Die Übertragung erfolgt TLS-verschlüsselt.
                    </p>
                </section>

                <section>
                    <h2 className="font-medium">7. Empfänger</h2>
                    <p>Interne Administratoren (rollenbasiert) sowie Auftragsverarbeiter:</p>
                    <ul className="list-disc ml-6">
                        <li>Hetzner Online GmbH (Hosting)</li>
                    </ul>
                </section>

                <section>
                    <h2 className="font-medium">8. Drittlandübermittlung</h2>
                    <p>Grundsätzlich keine Drittlandübermittlungen.</p>
                </section>

                <section>
                    <h2 className="font-medium">9. Speicherdauer und Löschung</h2>
                    <ul className="list-disc ml-6">
                        <li>Arbeitsstunden/Kontodaten: bis zur Zweckerfüllung bzw. gemäß gesetzlichen Aufbewahrungsfristen</li>
                        <li>Auth-Token: bis zum Logout bzw. manueller Löschung</li>
                        <li>Server-Logs: i. d. R. 7–14 Tage</li>
                    </ul>
                </section>

                <section>
                    <h2 className="font-medium">10. Rechte der Betroffenen</h2>
                    <ul className="list-disc ml-6">
                        <li>Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung</li>
                        <li>Datenübertragbarkeit, Widerspruch gegen Verarbeitungen</li>
                        <li>Beschwerde bei einer Aufsichtsbehörde</li>
                    </ul>
                </section>

                <section>
                    <h2 className="font-medium">11. Sicherheit</h2>
                    <p>Transportverschlüsselung (TLS), Zugriffsbeschränkungen, regelmäßige Updates und Backups.</p>
                </section>

                <section>
                    <h2 className="font-medium">12. Kontakt für Datenschutzanfragen</h2>
                    <p>
                        E-Mail: admin@tsv-bue-tennis.de, Postanschrift: TSV Bad Überkingen, Türkheimer Str. 21, 73337 Bad Überkingen. Ein Datenschutzbeauftragter ist nicht bestellt.
                    </p>
                </section>

                <p className="text-xs text-gray-500 mt-8">Stand: {TODAY}</p>
            </div>
        </div>
    );
};

export default Datenschutz;
