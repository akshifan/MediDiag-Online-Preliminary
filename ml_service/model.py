# ml_service/model.py
print("[ml_service] module import", "__name__=", __name__)
from dotenv import load_dotenv
load_dotenv()
print("ENV FILE LOADED")
import os
import re
import json
import numpy as np
import pandas as pd
import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("GEMINI_API_KEY"),
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
)

if not client.api_key:
    print("[ml_service] WARNING: GEMINI_API_KEY not set")
else:
    print("[ml_service] OPENAI_API_KEY loaded")

app = Flask(__name__)
CORS(app)

# -------------------------
# PURE ML MODEL for Symptom Checker (No fallback)
# -------------------------
class SymptomMLModel:
    def __init__(self):
        self.vectorizer = TfidfVectorizer(
            max_features=300, 
            ngram_range=(1, 3), 
            stop_words='english',
            min_df=2,
            max_df=0.9
        )
        self.label_encoder = LabelEncoder()
        self.model = RandomForestClassifier(
            n_estimators=500,
            max_depth=25,
            min_samples_split=2,
            min_samples_leaf=1,
            random_state=42,
            class_weight='balanced',
            bootstrap=True,
            max_features='sqrt'
        )
        self.trained = False
        self.symptom_patterns = {}
        
    def _create_comprehensive_training_data(self):
        """Create comprehensive and diverse training data"""
        print("[ML Model] Creating training data...")
        
        # More detailed disease-symptom mapping with weights
        disease_patterns = {
            'Common Cold': {
                'core': ['runny nose', 'sneezing', 'sore throat', 'congestion'],
                'common': ['cough', 'mild fever', 'fatigue', 'headache'],
                'rare': ['body aches', 'chills'],
                'weight': 8
            },
            'Influenza (Flu)': {
                'core': ['high fever', 'body aches', 'chills', 'severe fatigue'],
                'common': ['cough', 'headache', 'sore throat', 'runny nose'],
                'rare': ['nausea', 'vomiting', 'diarrhea'],
                'weight': 10
            },
            'Migraine': {
                'core': ['severe headache', 'sensitivity to light', 'sensitivity to sound'],
                'common': ['nausea', 'vomiting', 'visual disturbances'],
                'rare': ['dizziness', 'fatigue', 'neck pain'],
                'weight': 6
            },
            'Gastroenteritis': {
                'core': ['nausea', 'vomiting', 'diarrhea', 'stomach cramps'],
                'common': ['fever', 'loss of appetite', 'dehydration'],
                'rare': ['headache', 'body aches'],
                'weight': 7
            },
            'Urinary Tract Infection': {
                'core': ['painful urination', 'frequent urination', 'urinary urgency'],
                'common': ['lower abdominal pain', 'cloudy urine'],
                'rare': ['fever', 'nausea', 'blood in urine'],
                'weight': 5
            },
            'COVID-19': {
                'core': ['loss of taste', 'loss of smell', 'fever', 'dry cough'],
                'common': ['fatigue', 'shortness of breath', 'sore throat'],
                'rare': ['headache', 'body aches', 'nausea'],
                'weight': 9
            },
            'Bronchitis': {
                'core': ['persistent cough', 'mucus production', 'chest discomfort'],
                'common': ['shortness of breath', 'wheezing', 'fatigue'],
                'rare': ['fever', 'chills'],
                'weight': 5
            },
            'Allergic Rhinitis': {
                'core': ['sneezing', 'itchy eyes', 'runny nose', 'itchy throat'],
                'common': ['congestion', 'watery eyes'],
                'rare': ['headache', 'fatigue'],
                'weight': 4
            },
            'Pneumonia': {
                'core': ['cough with phlegm', 'fever', 'shortness of breath'],
                'common': ['chest pain', 'fatigue', 'chills'],
                'rare': ['nausea', 'confusion'],
                'weight': 6
            },
            'Sinusitis': {
                'core': ['facial pain', 'nasal congestion', 'thick nasal discharge'],
                'common': ['headache', 'cough', 'fatigue'],
                'rare': ['tooth pain', 'bad breath'],
                'weight': 4
            }
        }
        
        training_samples = []
        
        # Build symptom patterns for feature enhancement
        for disease, pattern in disease_patterns.items():
            all_symptoms = pattern['core'] + pattern['common'] + pattern['rare']
            self.symptom_patterns[disease] = all_symptoms
        
        # Generate training samples
        for disease, pattern in disease_patterns.items():
            weight = pattern['weight']
            
            # Generate different symptom combinations
            symptom_sets = []
            
            # Core symptoms only (2-3 symptoms)
            for i in range(2, min(4, len(pattern['core']) + 1)):
                import itertools
                for combo in itertools.combinations(pattern['core'], i):
                    symptom_sets.append(list(combo))
            
            # Core + common (3-4 symptoms)
            for i in range(1, min(3, len(pattern['common']) + 1)):
                for core_combo in itertools.combinations(pattern['core'], 2):
                    for common_combo in itertools.combinations(pattern['common'], i):
                        symptom_sets.append(list(core_combo) + list(common_combo))
            
            # Create samples with variations
            for symptoms in symptom_sets:
                # Basic symptom string
                symptom_text = ' '.join(symptoms)
                
                # Add variations
                variations = [
                    symptom_text,
                    symptom_text + ' for few days',
                    'having ' + symptom_text,
                    'experiencing ' + symptom_text,
                    symptom_text.replace(' ', ' and ')
                ]
                
                for var in variations:
                    training_samples.append({
                        'symptoms': var,
                        'disease': disease
                    })
                    
                    # Add with synonyms
                    training_samples.append({
                        'symptoms': self._add_synonyms(var),
                        'disease': disease
                    })
        
        df = pd.DataFrame(training_samples)
        print(f"[ML Model] Generated {len(df)} training samples")
        
        # Add some noise and variations
        df = self._add_noise_and_variations(df)
        
        return df
    
    def _add_synonyms(self, text):
        """Add symptom synonyms for better generalization"""
        synonym_map = {
            'fever': ['temperature', 'high temp', 'feverish'],
            'cough': ['coughing', 'dry cough', 'wet cough'],
            'headache': ['head pain', 'migraine pain'],
            'nausea': ['queasy', 'sick to stomach'],
            'vomiting': ['throwing up', 'emesis'],
            'diarrhea': ['loose stool', 'watery stool'],
            'sore throat': ['throat pain', 'scratchy throat'],
            'shortness of breath': ['breathlessness', 'difficulty breathing'],
            'runny nose': ['runny', 'nose running'],
            'sneezing': ['sneeze'],
            'fatigue': ['tired', 'exhausted'],
            'body aches': ['muscle pain', 'aching body'],
            'chills': ['shivering', 'cold shivers'],
            'congestion': ['stuffy nose', 'blocked nose'],
            'painful urination': ['burning urination', 'pain when urinating']
        }
        
        for word, synonyms in synonym_map.items():
            if word in text:
                for synonym in synonyms[:2]:
                    if synonym not in text:
                        text += ' ' + synonym
        
        return text
    
    def _add_noise_and_variations(self, df):
        """Add noise and variations to make model robust"""
        print("[ML Model] Adding variations to training data...")
        
        # Add symptom variations
        extended_samples = []
        
        for _, row in df.iterrows():
            symptoms = row['symptoms']
            disease = row['disease']
            
            # Keep original
            extended_samples.append({'symptoms': symptoms, 'disease': disease})
            
            # Add with extra words
            extra_words = ['also', 'plus', 'along with', 'and']
            for word in extra_words:
                extended_samples.append({
                    'symptoms': f"{symptoms} {word} discomfort",
                    'disease': disease
                })
            
            # Add with severity
            severities = ['mild', 'moderate', 'severe']
            for severity in severities:
                words = symptoms.split()
                if len(words) > 0:
                    modified = f"{severity} {words[0]} " + ' '.join(words[1:])
                    extended_samples.append({
                        'symptoms': modified,
                        'disease': disease
                    })
        
        return pd.DataFrame(extended_samples)
    
    def _clean_text(self, text):
        """Advanced text cleaning"""
        text = text.lower()
        
        # Remove punctuation but keep important info
        text = re.sub(r'[^\w\s]', ' ', text)
        
        # Remove extra spaces
        text = re.sub(r'\s+', ' ', text).strip()
        
        # Remove common filler words but keep medical terms
        filler_words = set([
            'i', 'me', 'my', 'have', 'has', 'had', 'am', 'is', 'are', 'was', 'were',
            'feeling', 'feel', 'experiencing', 'having', 'got', 'getting'
        ])
        
        words = text.split()
        filtered_words = []
        
        for word in words:
            # Keep medical sounding words or words longer than 3 chars
            if (len(word) > 3 or 
                word in ['fever', 'cough', 'pain', 'uti', 'flu'] or
                any(med in word for med in ['ache', 'itis', 'osis', 'algia'])):
                filtered_words.append(word)
            elif word not in filler_words:
                filtered_words.append(word)
        
        return ' '.join(filtered_words)
    
    def _extract_features(self, text):
        """Extract enhanced features including symptom patterns"""
        words = text.split()
        features = set(words)
        
        # Add n-grams
        for i in range(len(words)):
            # Bigrams
            if i < len(words) - 1:
                features.add(f"{words[i]}_{words[i+1]}")
            # Trigrams
            if i < len(words) - 2:
                features.add(f"{words[i]}_{words[i+1]}_{words[i+2]}")
        
        # Add disease-specific patterns
        for disease, symptoms in self.symptom_patterns.items():
            pattern_keywords = []
            for symptom in symptoms:
                symptom_words = symptom.split()
                pattern_keywords.extend(symptom_words)
            
            # Check if text contains disease-specific keywords
            if any(keyword in text for keyword in set(pattern_keywords)):
                features.add(f"pattern_{disease[:10].lower().replace(' ', '_')}")
        
        # Add symptom combinations
        symptom_combos = {
            'respiratory': ['cough', 'shortness', 'breath', 'wheezing'],
            'fever_related': ['fever', 'chills', 'sweating'],
            'gastro': ['nausea', 'vomiting', 'diarrhea', 'stomach'],
            'pain_related': ['pain', 'ache', 'sore', 'tender']
        }
        
        for combo_name, keywords in symptom_combos.items():
            if any(keyword in text for keyword in keywords):
                features.add(f"combo_{combo_name}")
        
        return ' '.join(features)
    
    def train(self):
        """Train the ML model"""
        print("[ML Model] Training machine learning model...")
        
        # Create training data
        df = self._create_comprehensive_training_data()
        
        # Preprocess text
        df['symptoms_processed'] = df['symptoms'].apply(self._clean_text)
        df['symptoms_enhanced'] = df['symptoms_processed'].apply(self._extract_features)
        
        print(f"[ML Model] Sample processed: {df['symptoms_processed'].iloc[0]}")
        print(f"[ML Model] Sample enhanced: {df['symptoms_enhanced'].iloc[0]}")
        
        # Prepare features and labels
        X = self.vectorizer.fit_transform(df['symptoms_enhanced'])
        y = self.label_encoder.fit_transform(df['disease'])
        
        print(f"[ML Model] Feature matrix shape: {X.shape}")
        print(f"[ML Model] Number of diseases: {len(self.label_encoder.classes_)}")
        print(f"[ML Model] Diseases: {list(self.label_encoder.classes_)}")
        
        # Split data for validation
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
        
        # Train model
        self.model.fit(X_train, y_train)
        
        # Calculate accuracy
        from sklearn.metrics import accuracy_score, classification_report
        y_pred = self.model.predict(X_val)
        accuracy = accuracy_score(y_val, y_pred)
        
        print(f"[ML Model] Validation Accuracy: {accuracy:.4f}")
        print("\n[ML Model] Classification Report:")
        print(classification_report(y_val, y_pred, 
                                   target_names=self.label_encoder.classes_))
        
        # Calculate feature importance
        feature_names = self.vectorizer.get_feature_names_out()
        importances = self.model.feature_importances_
        top_features = sorted(zip(feature_names, importances), 
                             key=lambda x: x[1], reverse=True)[:20]
        
        print("\n[ML Model] Top 20 Important Features:")
        for feature, importance in top_features:
            print(f"  {feature}: {importance:.4f}")
        
        # Save model
        self._save_model()
        self.trained = True
        
        return accuracy
    
    def _save_model(self):
        """Save trained model"""
        joblib.dump(self.vectorizer, 'symptom_vectorizer.joblib')
        joblib.dump(self.label_encoder, 'disease_encoder.joblib')
        joblib.dump(self.model, 'diagnosis_ml_model.joblib')
        
        # Save symptom patterns
        with open('symptom_patterns.json', 'w') as f:
            json.dump(self.symptom_patterns, f)
        
        print("[ML Model] Model saved to disk")
    
    def load_model(self):
        """Load trained model"""
        try:
            self.vectorizer = joblib.load('symptom_vectorizer.joblib')
            self.label_encoder = joblib.load('disease_encoder.joblib')
            self.model = joblib.load('diagnosis_ml_model.joblib')
            
            # Load symptom patterns
            with open('symptom_patterns.json', 'r') as f:
                self.symptom_patterns = json.load(f)
            
            self.trained = True
            print("[ML Model] Pre-trained model loaded successfully")
            
            # Print model info
            print(f"[ML Model] Number of features: {len(self.vectorizer.get_feature_names_out())}")
            print(f"[ML Model] Number of diseases: {len(self.label_encoder.classes_)}")
            print(f"[ML Model] Diseases available: {list(self.label_encoder.classes_)}")
            
            return True
        except Exception as e:
            print(f"[ML Model] Could not load saved model: {e}")
            return False
    
    def predict(self, symptoms_text):
        """Predict disease from symptoms using only ML model"""
        if not self.trained:
            raise Exception("ML Model not trained. Please train or load the model first.")
        
        # Clean and enhance text
        cleaned_text = self._clean_text(symptoms_text)
        enhanced_text = self._extract_features(cleaned_text)
        
        print(f"[ML Prediction] Input: {symptoms_text}")
        print(f"[ML Prediction] Cleaned: {cleaned_text}")
        print(f"[ML Prediction] Enhanced: {enhanced_text}")
        
        # Vectorize
        X = self.vectorizer.transform([enhanced_text])
        
        # Check if features are present
        if X.sum() == 0:
            print("[ML Prediction] No features extracted from input")
            return None, 0.0, [], 'unknown'
        
        # Get prediction probabilities
        probabilities = self.model.predict_proba(X)[0]
        
        # Get top 3 predictions
        top_3_indices = np.argsort(probabilities)[-3:][::-1]
        top_3_diseases = self.label_encoder.inverse_transform(top_3_indices)
        top_3_probs = probabilities[top_3_indices]
        
        # Get top prediction
        top_disease = top_3_diseases[0]
        top_confidence = top_3_probs[0]
        
        # Extract identified symptoms
        identified_symptoms = self._identify_symptoms(cleaned_text)
        
        # Determine urgency
        urgency = self._get_urgency(top_disease, top_confidence, len(identified_symptoms))
        
        print(f"[ML Prediction] Top disease: {top_disease} ({top_confidence:.2%})")
        print(f"[ML Prediction] Identified symptoms: {identified_symptoms}")
        print(f"[ML Prediction] Urgency: {urgency}")
        
        # Return top prediction if confidence is reasonable
        if top_confidence > 0.15:  # Lower threshold for ML-only model
            return top_disease, top_confidence, identified_symptoms, urgency
        else:
            return None, top_confidence, identified_symptoms, 'unknown'
    
    def _identify_symptoms(self, text):
        """Identify symptoms from text"""
        words = set(text.split())
        features = set(self.vectorizer.get_feature_names_out())
        
        # Find matching symptoms
        identified = list(words.intersection(features))
        
        # Also check for multi-word symptoms in patterns
        for disease, symptoms in self.symptom_patterns.items():
            for symptom in symptoms:
                if symptom in text:
                    identified.append(symptom)
        
        return list(set(identified))
    
    def _get_urgency(self, disease, confidence, symptom_count):
        """Determine urgency based on disease and confidence"""
        urgent_diseases = ['Pneumonia', 'COVID-19', 'Urinary Tract Infection']
        emergency_diseases = []  # Add if needed
        
        if disease in emergency_diseases:
            return 'emergency'
        elif disease in urgent_diseases and confidence > 0.4:
            return 'high'
        elif symptom_count >= 3 and confidence > 0.6:
            return 'medium'
        else:
            return 'low'
    
    def get_recommendation(self, disease, confidence, symptom_count):
        """Get recommendation based on ML prediction"""
        recommendations = {
            'Common Cold': 'Rest, stay hydrated, use over-the-counter cold remedies. See doctor if symptoms persist >10 days.',
            'Influenza (Flu)': 'Rest, drink fluids, use fever reducers. Seek medical care if breathing difficulty or high fever persists.',
            'Migraine': 'Rest in dark quiet room, stay hydrated. Consult doctor for preventive treatment options.',
            'Gastroenteritis': 'Stay hydrated with electrolyte solutions. Eat bland foods (BRAT diet). See doctor if severe dehydration.',
            'Urinary Tract Infection': 'Drink plenty of water. Requires medical evaluation and likely antibiotics.',
            'COVID-19': 'Isolate, rest, monitor symptoms. Seek emergency care if difficulty breathing.',
            'Bronchitis': 'Rest, use humidifier, stay hydrated. See doctor if symptoms persist >3 weeks.',
            'Allergic Rhinitis': 'Avoid allergens, use antihistamines or nasal sprays.',
            'Pneumonia': 'Requires medical attention. May need antibiotics. Rest and stay hydrated.',
            'Sinusitis': 'Use saline nasal spray, stay hydrated. See doctor if symptoms persist >10 days.'
        }
        
        base = recommendations.get(disease, 'Consult a healthcare professional for proper diagnosis and treatment.')
        
        # Add confidence qualifier
        if confidence < 0.3:
            base = f"Low confidence prediction. {base}"
        elif confidence > 0.7:
            base = f"High confidence prediction. {base}"
        
        return base
    
    def needs_doctor(self, urgency):
        """Determine if doctor visit is needed"""
        return urgency in ['high', 'emergency']

# Initialize ML Model (NO FALLBACK)
ml_model = SymptomMLModel()

# Try to load existing model, else train new one
if not ml_model.load_model():
    print("[ML Model] Training new model...")
    accuracy = ml_model.train()
    print(f"[ML Model] Training completed with accuracy: {accuracy:.2%}")

# -------------------------
# Gemini Chat Functions (separate from diagnosis)
# -------------------------
# -------------------------
# Gemini Chat Functions
# -------------------------
def chat_with_gemini(message):
    models = [
        "gemini-3.6-flash",
        "gemini-3.5-flash-lite"
    ]

    for model_name in models:
        try:
            print(f"[Gemini Chat] Requesting model: {model_name}")

            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are MediDiag Assistant, a helpful and cautious "
                            "medical information assistant.\n\n"

                            "Your job is to provide general health information "
                            "and guidance. Do not make a definitive medical "
                            "diagnosis. The separate Symptom Checker is used "
                            "for preliminary automated analysis.\n\n"

                            "For health questions:\n"
                            "1. Acknowledge the user's concern empathetically.\n"
                            "2. Explain possible general causes or considerations.\n"
                            "3. Give practical, safe next steps.\n"
                            "4. Mention important warning signs when appropriate.\n"
                            "5. Clearly state that the information is not a "
                            "substitute for professional medical advice.\n\n"

                            "Give a complete response. Do not stop in the middle "
                            "of a sentence. Keep responses reasonably concise "
                            "but provide enough information to be useful."
                        )
                    },
                    {
                        "role": "user",
                        "content": str(message).strip()
                    }
                ],
                temperature=0.7,
                max_tokens=1000
            )

            # -------------------------
            # Safely extract response
            # -------------------------
            if not response:
                raise Exception("Gemini returned no response object")

            if not response.choices:
                raise Exception("Gemini returned no choices")

            choice = response.choices[0]

            content = getattr(
                getattr(choice, "message", None),
                "content",
                None
            )

            if not content:
                raise Exception("Gemini returned empty message content")

            content = str(content).strip()

            if not content:
                raise Exception("Gemini returned blank content")

            finish_reason = getattr(
                choice,
                "finish_reason",
                None
            )

            print(
                f"[Gemini Chat] model={model_name} "
                f"finish_reason={finish_reason} "
                f"response_length={len(content)}"
            )

            # If the provider reports that the response was cut because
            # of the output limit, log it clearly.
            if finish_reason in ["length", "max_tokens"]:
                print(
                    "[Gemini Chat] WARNING: response reached output limit"
                )

            return content

        except Exception as e:
            print(
                f"[Gemini Chat Error - {model_name}]: "
                f"{type(e).__name__}: {e}"
            )

    return (
        "I'm sorry, but the AI assistant is temporarily unavailable. "
        "Please try again in a moment or contact a healthcare professional."
    )

# -------------------------
# Routes (ML Model Only - No Fallback)
# -------------------------
@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy', 
        'model': 'ml_only',
        'trained': ml_model.trained,
        'diseases': list(ml_model.label_encoder.classes_) if ml_model.trained else []
    })

@app.route('/analyze', methods=['POST'])
def analyze_route():
    """Symptom checker - ML MODEL ONLY (no fallback)"""
    payload = request.get_json() or {}
    symptoms = payload.get('symptoms') or payload.get('text') or ""
    symptoms = str(symptoms).strip()
    
    if not symptoms:
        return jsonify({'error': 'No symptoms provided'}), 400
    
    if not ml_model.trained:
        return jsonify({'error': 'ML model not trained'}), 503
    
    # Use ML model ONLY
    try:
        disease, confidence, identified_symptoms, urgency = ml_model.predict(symptoms)
        
        if disease is None:
            return jsonify({
                "source": "ml_model",
                "diagnosis": "No clear diagnosis identified",
                "identified_symptoms": identified_symptoms,
                "confidence": float(confidence),
                "recommendation": "Please provide more specific symptoms or consult a healthcare professional.",
                "needs_doctor": True,
                "urgency": "unknown"
            })
        
        # Get recommendation
        recommendation = ml_model.get_recommendation(disease, confidence, len(identified_symptoms))
        needs_doctor = ml_model.needs_doctor(urgency)
        
        return jsonify({
            "source": "ml_model",
            "diagnosis": f"Possible {disease}",
            "identified_symptoms": identified_symptoms,
            "confidence": float(confidence),
            "recommendation": recommendation,
            "needs_doctor": needs_doctor,
            "urgency": urgency
        })
        
    except Exception as e:
        print(f"[ML Model Error]: {e}")
        return jsonify({
            "error": "ML diagnosis service error",
            "message": "Please try again with different symptoms or consult a doctor directly."
        }), 500

@app.route('/chat', methods=['POST'])
def chat_route():
    """Chat support - uses OpenAI only (separate from diagnosis)"""
    payload = request.get_json() or {}
    user_message = payload.get("message", "").strip()
    
    if not user_message:
        return jsonify({"reply": "Please enter a message."})
    
    # Use Gemini for chat support
    try:
        reply = chat_with_gemini(user_message)
        return jsonify({"reply": reply})
    except Exception as e:
        print(f"[GeminiChat Error]: {e}")
        return jsonify({"reply": "I'm here to help! For medical diagnosis, please use our symptom checker feature."})

@app.route('/diagnose', methods=['POST'])
def diagnose_alias():
    """Backward-compatible alias for /analyze."""
    return analyze_route()

@app.route('/model_info', methods=['GET'])
def model_info():
    """Get information about the ML model"""
    if not ml_model.trained:
        return jsonify({'error': 'Model not trained'}), 404
    
    return jsonify({
        'model_type': 'RandomForestClassifier',
        'n_estimators': ml_model.model.n_estimators,
        'diseases': list(ml_model.label_encoder.classes_),
        'n_features': len(ml_model.vectorizer.get_feature_names_out()),
        'trained': ml_model.trained
    })

@app.route('/retrain', methods=['POST'])
def retrain_route():
    """Retrain the ML model"""
    try:
        print("[ML Model] Retraining model...")
        accuracy = ml_model.train()
        return jsonify({
            "success": True,
            "message": "ML model retrained successfully",
            "accuracy": accuracy
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# -------------------------
# Run the application
# -------------------------
if __name__ == '__main__':
    import os

    port = int(os.environ.get("PORT", 5000))

    print(f"[ml_service] Starting on 0.0.0.0:{port} debug=False")

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )