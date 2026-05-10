import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  card: {
    margin: 10,
    padding: 15,
    borderRadius: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  metric: {
    fontSize: 16,
    marginBottom: 5,
    color: '#666',
  },
  subTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 5,
    color: '#333',
  },
  listItem: {
    fontSize: 14,
    marginBottom: 3,
    color: '#555',
  },
  recommendation: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#007AFF',
  },
  explanation: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#888',
    marginTop: 10,
  },
  tabBar: {
    backgroundColor: 'white',
  },
  tabLabel: {
    fontSize: 14,
    color: '#333',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    marginTop: 10,
  },
});